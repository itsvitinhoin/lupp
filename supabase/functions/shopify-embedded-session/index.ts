import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
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

type ShopifyLaunchBody = {
  host?: string;
  shop?: string;
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

function toBase64UrlString(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

async function signState(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = toBase64UrlString(JSON.stringify(payload));
  const signature = await hmacSha256Base64Url(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
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

function normalizeShopDomain(dest: string) {
  return new URL(dest).hostname.toLowerCase();
}

function buildReturnTo(appUrl: string, shop: string, host?: string) {
  const url = new URL("/app", appUrl);
  url.searchParams.set("shop", shop);
  if (host) url.searchParams.set("host", host);
  return url.toString();
}

async function buildAuthorizeUrl(params: {
  apiKey: string;
  appUrl: string;
  host?: string;
  redirectUri: string;
  scopes: string;
  shop: string;
  stateSecret: string;
}) {
  const returnTo = buildReturnTo(params.appUrl, params.shop, params.host);
  const state = await signState(
    {
      host: params.host || null,
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      return_to: returnTo,
      shop: params.shop,
    },
    params.stateSecret,
  );

  const authorizeUrl = new URL(`https://${params.shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", params.apiKey);
  authorizeUrl.searchParams.set("scope", params.scopes);
  authorizeUrl.searchParams.set("redirect_uri", params.redirectUri);
  authorizeUrl.searchParams.set("state", state);
  return authorizeUrl.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl =
    Deno.env.get("SHOPIFY_APP_URL") ||
    Deno.env.get("LUPP_APP_URL") ||
    "https://www.playluup.com.br";
  const redirectUri =
    Deno.env.get("SHOPIFY_REDIRECT_URI") ||
    `${supabaseUrl}/functions/v1/shopify-oauth-callback`;
  const stateSecret = Deno.env.get("SHOPIFY_STATE_SECRET") || serviceRoleKey;

  if (!supabaseUrl || !serviceRoleKey || !stateSecret) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const launchBody = (await req.json().catch(() => ({}))) as ShopifyLaunchBody;

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
    return jsonResponse({ error: "missing_shopify_app_config" }, 500);
  }

  const verification = await verifyShopifySessionToken(
    token,
    appConfig.apiKey,
    appConfig.apiSecret,
  );
  if ("error" in verification) {
    return jsonResponse({ error: verification.error }, 401);
  }

  const shop = normalizeShopDomain(verification.payload.dest);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, store_id, provider, status, external_store_id")
    .eq("provider", "shopify")
    .in("external_store_id", [shop, `https://${shop}`])
    .maybeSingle();

  if (integrationError) {
    return jsonResponse(
      { error: `integration_lookup_failed:${integrationError.message}` },
      500,
    );
  }

  if (!integration?.store_id) {
    const authorizeUrl = await buildAuthorizeUrl({
      apiKey: appConfig.apiKey,
      appUrl,
      host: launchBody.host,
      redirectUri,
      scopes: appConfig.scopes,
      shop,
      stateSecret,
    });
    return jsonResponse(
      { authorize_url: authorizeUrl, error: "shopify_oauth_required", shop },
      409,
    );
  }

  const { data: secret, error: secretError } = await supabase
    .from("integration_secrets")
    .select("integration_id, access_token")
    .eq("integration_id", integration.id)
    .maybeSingle();

  if (secretError) {
    return jsonResponse(
      { error: `integration_secret_lookup_failed:${secretError.message}` },
      500,
    );
  }

  if (!secret?.access_token) {
    const authorizeUrl = await buildAuthorizeUrl({
      apiKey: appConfig.apiKey,
      appUrl,
      host: launchBody.host,
      redirectUri,
      scopes: appConfig.scopes,
      shop,
      stateSecret,
    });
    return jsonResponse(
      { authorize_url: authorizeUrl, error: "shopify_oauth_required", shop },
      409,
    );
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .eq("id", integration.store_id)
    .maybeSingle();

  if (storeError) {
    return jsonResponse(
      { error: `store_lookup_failed:${storeError.message}` },
      500,
    );
  }
  if (!store) {
    return jsonResponse({ error: "store_not_found", shop }, 404);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", store.owner_id)
    .maybeSingle();

  return jsonResponse({
    integration,
    ok: true,
    profile: profile ?? null,
    shop,
    store,
    user: {
      app_metadata: { provider: "shopify_embedded" },
      aud: "authenticated",
      created_at: store.created_at,
      email: profile?.email ?? `${shop}@shopify.luup.local`,
      id: store.owner_id,
      role: "authenticated",
      user_metadata: {
        name: profile?.name ?? store.name,
        shop,
      },
    },
  });
});
