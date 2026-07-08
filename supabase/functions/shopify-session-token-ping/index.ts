import { resolveShopifyAppConfig } from "../_shared/shopify-app-config.ts";

type ShopifySessionPayload = {
  aud?: string;
  dest?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sid?: string;
  sub?: string;
};

const jsonHeaders = {
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: jsonHeaders,
    status,
  });
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64UrlToString(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function toBase64Url(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function safeEqual(expected: string, received: string) {
  if (expected.length !== received.length) return false;
  let result = 0;
  for (let index = 0; index < expected.length; index += 1) {
    result |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return result === 0;
}

async function hmacSha256Base64Url(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return toBase64Url(signature);
}

async function verifyShopifySessionToken(
  token: string,
  apiKey: string,
  apiSecret: string,
) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { error: "invalid_token_shape" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: { alg?: string };
  let payload: ShopifySessionPayload;

  try {
    header = JSON.parse(base64UrlToString(encodedHeader));
    payload = JSON.parse(base64UrlToString(encodedPayload));
  } catch {
    return { error: "invalid_token_json" };
  }

  if (header.alg !== "HS256") {
    return { error: "invalid_token_algorithm" };
  }

  const expectedSignature = await hmacSha256Base64Url(
    `${encodedHeader}.${encodedPayload}`,
    apiSecret,
  );
  if (!safeEqual(expectedSignature, encodedSignature)) {
    return { error: "invalid_token_signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { error: "token_expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 5) {
    return { error: "token_not_active" };
  }
  if (payload.aud !== apiKey) {
    return { error: "invalid_token_audience" };
  }
  if (
    typeof payload.dest !== "string" ||
    !payload.dest.startsWith("https://")
  ) {
    return { error: "invalid_token_destination" };
  }

  return { payload };
}

function decodeShopifySessionPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlToString(parts[1])) as ShopifySessionPayload;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "missing_session_token" }, 401);
  }

  const untrustedPayload = decodeShopifySessionPayload(token);
  const appConfig = resolveShopifyAppConfig({
    apiKey: untrustedPayload?.aud,
    shop: untrustedPayload?.dest,
  });
  if (!appConfig) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const verification = await verifyShopifySessionToken(
    token,
    appConfig.apiKey,
    appConfig.apiSecret,
  );
  if ("error" in verification) {
    return jsonResponse({ error: verification.error }, 401);
  }

  return jsonResponse({
    ok: true,
    dest: verification.payload.dest,
    sub: verification.payload.sub,
  });
});
