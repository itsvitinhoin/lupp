import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { resolveShopifyAppConfig } from "../_shared/shopify-app-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signState(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
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
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeShopDomain(value: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!cleaned || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function inferShopDomain(input: unknown, fallbackUrl: unknown) {
  const fromInput = normalizeShopDomain(String(input || ""));
  if (fromInput) return fromInput;
  return normalizeShopDomain(String(fallbackUrl || ""));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    return jsonResponse({ error: "missing_shopify_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  const returnTo = String(
    body.return_to || `${appUrl}/app/integrations`,
  ).trim();
  if (!storeId) {
    return jsonResponse({ error: "missing_store_id" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "invalid_user" }, 401);
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, url")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError || !store?.id) {
    return jsonResponse({ error: "store_not_found" }, 404);
  }

  const { data: member, error: memberError } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  const shop = inferShopDomain(body.shop, store.url);
  if (!shop) {
    return jsonResponse({ error: "missing_shopify_shop_domain" }, 400);
  }

  const appConfig = resolveShopifyAppConfig({ shop });
  if (!appConfig) {
    return jsonResponse({ error: "missing_shopify_app_config" }, 500);
  }

  const state = await signState(
    {
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo,
      shop,
      store_id: storeId,
      user_id: user.id,
    },
    stateSecret,
  );

  const authorizeUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", appConfig.apiKey);
  authorizeUrl.searchParams.set("scope", appConfig.scopes);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return jsonResponse({ authorize_url: authorizeUrl.toString(), shop });
});
