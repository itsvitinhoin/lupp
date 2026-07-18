import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Shopify helpers ported from supabase/functions/_shared/shopify-app-config.ts
 * plus the crypto/fetch plumbing the shopify-* edge functions duplicated
 * (signed OAuth state, request/webhook HMACs, embedded-app session tokens and
 * the thin Admin API fetch wrappers).
 */

export type ShopifyAppConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  shop?: string;
};

type ShopifyCustomAppInput = {
  api_key?: unknown;
  api_secret?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
  scope?: unknown;
  scopes?: unknown;
  secret?: unknown;
  shop?: unknown;
  shops?: unknown;
};

type ShopifyCustomApp = {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  shops: string[];
};

export type ShopifyTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

export type ShopifySessionTokenPayload = {
  aud?: string;
  dest?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sid?: string;
  sub?: string;
};

export type ShopifyOAuthState = {
  host?: string | null;
  iat?: number;
  mode?: "embedded_bootstrap";
  return_to?: string;
  shop?: string;
  store_id?: string;
  user_id?: string;
};

const DEFAULT_SCOPES = "read_products,read_inventory,read_locations";

export function normalizeShopDomain(value: unknown) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned) ? cleaned : "";
}

// Lenient variant used by shopify-connect-custom-app: a bare store handle
// ("my-shop") is expanded to its myshopify.com domain.
export function normalizeShopHandleOrDomain(value: unknown) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  if (!cleaned) return "";
  if (/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
    return `${cleaned}.myshopify.com`;
  }
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    return cleaned;
  }
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomApp(
  entry: ShopifyCustomAppInput,
  keyHint?: string,
): ShopifyCustomApp | null {
  const apiKey =
    stringValue(entry.client_id) ||
    stringValue(entry.api_key) ||
    (keyHint?.includes(".") ? "" : keyHint || "");
  const apiSecret =
    stringValue(entry.client_secret) ||
    stringValue(entry.api_secret) ||
    stringValue(entry.secret);
  const scopes =
    stringValue(entry.scopes) ||
    stringValue(entry.scope) ||
    env.SHOPIFY_SCOPES ||
    DEFAULT_SCOPES;
  const shops = new Set<string>();
  const shop = normalizeShopDomain(entry.shop);
  if (shop) shops.add(shop);
  if (keyHint?.includes(".")) {
    const hintedShop = normalizeShopDomain(keyHint);
    if (hintedShop) shops.add(hintedShop);
  }
  if (Array.isArray(entry.shops)) {
    for (const item of entry.shops) {
      const normalized = normalizeShopDomain(item);
      if (normalized) shops.add(normalized);
    }
  }

  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    scopes,
    shops: Array.from(shops),
  };
}

function readCustomApps(): ShopifyCustomApp[] {
  const raw = env.SHOPIFY_CUSTOM_APPS_JSON || "";
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) =>
          normalizeCustomApp((entry || {}) as ShopifyCustomAppInput),
        )
        .filter((entry): entry is ShopifyCustomApp => Boolean(entry));
    }

    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, ShopifyCustomAppInput>)
        .map(([key, entry]) =>
          normalizeCustomApp((entry || {}) as ShopifyCustomAppInput, key),
        )
        .filter((entry): entry is ShopifyCustomApp => Boolean(entry));
    }
  } catch {
    return [];
  }

  return [];
}

export function getDefaultShopifyAppConfig(): ShopifyAppConfig | null {
  const apiKey = env.SHOPIFY_API_KEY || "";
  const apiSecret = env.SHOPIFY_API_SECRET || "";
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    scopes: env.SHOPIFY_SCOPES || DEFAULT_SCOPES,
  };
}

export function resolveShopifyAppConfig(
  params: { apiKey?: unknown; shop?: unknown } = {},
): ShopifyAppConfig | null {
  const shop = normalizeShopDomain(params.shop);
  const apiKey = stringValue(params.apiKey);
  const customApps = readCustomApps();
  const custom = customApps.find((app) => {
    if (!app) return false;
    if (apiKey && app.apiKey === apiKey) return true;
    return Boolean(shop && app.shops.includes(shop));
  });

  if (custom) {
    return {
      apiKey: custom.apiKey,
      apiSecret: custom.apiSecret,
      scopes: custom.scopes,
      shop: shop || custom.shops[0],
    };
  }

  return getDefaultShopifyAppConfig();
}

// ---------------------------------------------------------------------------
// Server config (SPA base URL + OAuth redirect URI)
// ---------------------------------------------------------------------------

/** SPA base URL the OAuth flows redirect back to. */
export function shopifyAppUrl() {
  return env.SHOPIFY_APP_URL || env.LUPP_APP_URL || "https://luup.dzns.com.br";
}

/**
 * OAuth redirect_uri. The originals defaulted to the Supabase function URL;
 * standalone deployments must set SHOPIFY_REDIRECT_URI to this server's
 * public /api/integrations/shopify/oauth/callback URL (the app-URL fallback
 * only works when the API is served from the same host).
 */
export function shopifyRedirectUri() {
  return (
    env.SHOPIFY_REDIRECT_URI ||
    new URL("/api/integrations/shopify/oauth/callback", shopifyAppUrl()).toString()
  );
}

// ---------------------------------------------------------------------------
// Crypto helpers (HMAC state, request signatures, session tokens)
// ---------------------------------------------------------------------------

export function shopifySafeEqual(expected: string, received: string) {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function hmacBase64Url(message: string, secret: string) {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

export function signShopifyState(
  payload: Record<string, unknown>,
  secret: string,
) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${hmacBase64Url(encodedPayload, secret)}`;
}

/**
 * Verifies a signed OAuth state (shopify-oauth-callback). Returns null when
 * the signature, shape or age (30 minutes) is invalid.
 */
export function verifyShopifyState(
  state: string,
  secret: string,
): ShopifyOAuthState | null {
  const [encodedPayload, receivedSignature] = state.split(".");
  if (!encodedPayload || !receivedSignature) return null;

  const expectedSignature = hmacBase64Url(encodedPayload, secret);
  if (!shopifySafeEqual(expectedSignature, receivedSignature)) return null;

  let payload: ShopifyOAuthState;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ShopifyOAuthState;
  } catch {
    return null;
  }

  if (!payload.shop) return null;
  if (
    payload.mode !== "embedded_bootstrap" &&
    (!payload.store_id || !payload.user_id)
  )
    return null;
  if (payload.iat && Date.now() / 1000 - payload.iat > 60 * 30) return null;
  return payload;
}

/**
 * Verifies the `hmac` query param Shopify adds to OAuth redirects: hex
 * HMAC-SHA256 over the remaining params sorted by key.
 */
export function verifyShopifyRequestHmac(
  query: Record<string, unknown>,
  secret: string,
) {
  const receivedHmac = typeof query.hmac === "string" ? query.hmac : "";
  if (!receivedHmac) return false;

  const message = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expectedHmac = createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return shopifySafeEqual(expectedHmac, receivedHmac);
}

/**
 * Verifies the x-shopify-hmac-sha256 webhook signature: base64 HMAC-SHA256
 * over the raw request body.
 */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  receivedHmac: string,
  secret: string,
) {
  if (!receivedHmac) return false;
  const expectedHmac = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return shopifySafeEqual(expectedHmac.trim(), receivedHmac.trim());
}

export function decodeShopifySessionTokenPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as ShopifySessionTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verifies a Shopify embedded-app SESSION token: HS256 signed with the app
 * secret (not our user JWT), aud = app api key, dest = https://{shop}.
 */
export function verifyShopifySessionToken(
  token: string,
  apiKey: string,
  apiSecret: string,
):
  | { payload: ShopifySessionTokenPayload & { dest: string } }
  | { error: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { error: "invalid_token_shape" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: { alg?: string };
  let payload: ShopifySessionTokenPayload;

  try {
    header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    );
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return { error: "invalid_token_json" };
  }

  if (header.alg !== "HS256") {
    return { error: "invalid_token_algorithm" };
  }

  const expectedSignature = hmacBase64Url(
    `${encodedHeader}.${encodedPayload}`,
    apiSecret,
  );
  if (!shopifySafeEqual(expectedSignature, encodedSignature)) {
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

  return {
    payload: payload as ShopifySessionTokenPayload & { dest: string },
  };
}

// ---------------------------------------------------------------------------
// URL builders / fetch wrappers (dumb clients — massaging stays in handlers)
// ---------------------------------------------------------------------------

export function buildShopifyAuthorizeUrl(params: {
  apiKey: string;
  redirectUri: string;
  scopes: string;
  shop: string;
  state: string;
}) {
  const authorizeUrl = new URL(`https://${params.shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", params.apiKey);
  authorizeUrl.searchParams.set("scope", params.scopes);
  authorizeUrl.searchParams.set("redirect_uri", params.redirectUri);
  authorizeUrl.searchParams.set("state", params.state);
  return authorizeUrl.toString();
}

export function shopifyTokenExpiresAt(seconds: number | undefined) {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
}

/** POST https://{shop}/admin/oauth/access_token (form-encoded). */
export async function requestShopifyAccessToken(
  shop: string,
  body: Record<string, string>,
) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    body: new URLSearchParams(body).toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as ShopifyTokenResponse;
  return { ok: response.ok, payload, status: response.status };
}

/** GET https://{shop}/admin/api/{version}/shop.json (Admin REST). */
export async function fetchShopifyShop(shop: string, accessToken: string) {
  const response = await fetch(
    `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/shop.json`,
    {
      headers: {
        Accept: "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      method: "GET",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, payload, status: response.status };
}

/** POST https://{shop}/admin/api/{version}/graphql.json (Admin GraphQL). */
export async function shopifyGraphql(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch(
    `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
    {
      body: JSON.stringify({ query, variables }),
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, payload, status: response.status };
}
