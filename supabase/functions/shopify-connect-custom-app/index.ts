import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type ShopifyShopResponse = {
  errors?: unknown;
  shop?: {
    domain?: string | null;
    email?: string | null;
    id?: number | string | null;
    myshopify_domain?: string | null;
    name?: string | null;
  };
};

type ShopifyTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  scope?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeShopDomain(value: string | null | undefined) {
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

function isAdminApiToken(value: string) {
  const token = value.trim();
  return (
    token.startsWith("shpat_") ||
    token.startsWith("shpua_") ||
    token.length >= 20
  );
}

function expiresAt(seconds: number | undefined) {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
}

async function requestClientCredentialsToken({
  apiSecret,
  clientId,
  shop,
}: {
  apiSecret: string;
  clientId: string;
  shop: string;
}) {
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: apiSecret,
    grant_type: "client_credentials",
  });
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    body: tokenBody.toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as ShopifyTokenResponse;

  if (!response.ok || !payload.access_token) {
    return {
      ok: false,
      payload,
      status: response.status,
    };
  }

  return {
    ok: true,
    payload,
    status: response.status,
  };
}

async function readShop({
  accessToken,
  apiVersion,
  shop,
}: {
  accessToken: string;
  apiVersion: string;
  shop: string;
}) {
  const response = await fetch(
    `https://${shop}/admin/api/${apiVersion}/shop.json`,
    {
      headers: {
        Accept: "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      method: "GET",
    },
  );
  const payload = (await response
    .json()
    .catch(() => ({}))) as ShopifyShopResponse;

  if (!response.ok || payload.errors || !payload.shop) {
    return {
      ok: false,
      status: response.status,
      message:
        typeof payload.errors === "string"
          ? payload.errors
          : `shopify_custom_app_validation_failed:${response.status}`,
    };
  }

  return { ok: true, payload, status: response.status };
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
  const apiVersion = Deno.env.get("SHOPIFY_API_VERSION") || "2026-04";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  const shop = normalizeShopDomain(String(body.shop || body.shop_domain || ""));
  const accessToken = String(
    body.access_token || body.admin_api_access_token || "",
  ).trim();
  const clientId = String(body.client_id || body.clientId || "").trim();
  const clientSecret = String(
    body.client_secret || body.clientSecret || "",
  ).trim();

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!shop) return jsonResponse({ error: "missing_shopify_shop_domain" }, 400);
  if (!accessToken && (!clientId || !clientSecret)) {
    return jsonResponse({ error: "missing_shopify_credentials" }, 400);
  }
  if (accessToken && !isAdminApiToken(accessToken)) {
    return jsonResponse({ error: "invalid_shopify_admin_api_token" }, 400);
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

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  let tokenForValidation = accessToken;
  let tokenData: ShopifyTokenResponse | null = null;
  const connectionMode = accessToken
    ? "custom_app_manual"
    : "custom_app_client_credentials";

  if (!tokenForValidation) {
    const tokenResult = await requestClientCredentialsToken({
      apiSecret: clientSecret,
      clientId,
      shop,
    });

    if (!tokenResult.ok || !tokenResult.payload.access_token) {
      return jsonResponse(
        {
          error: "shopify_client_credentials_token_failed",
          message:
            tokenResult.payload.error_description ||
            tokenResult.payload.error ||
            null,
          status: tokenResult.status,
        },
        tokenResult.status === 401 || tokenResult.status === 403 ? 401 : 502,
      );
    }

    tokenData = tokenResult.payload;
    tokenForValidation = tokenResult.payload.access_token;
  }

  const validation = await readShop({
    accessToken: tokenForValidation,
    apiVersion,
    shop,
  });
  if (!validation.ok) {
    return jsonResponse(
      {
        error: "shopify_custom_app_validation_failed",
        message: validation.message,
        status: validation.status,
      },
      validation.status === 401 || validation.status === 403 ? 401 : 502,
    );
  }

  const shopInfo = validation.payload?.shop ?? {};
  const now = new Date().toISOString();
  const shopDomain = normalizeShopDomain(shopInfo.myshopify_domain || shop) || shop;
  const storeUrl = shopInfo.domain ? `https://${shopInfo.domain}` : `https://${shopDomain}`;

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .upsert(
      {
        connected_at: now,
        credentials: {},
        external_store_id: shopDomain,
        provider: "shopify",
        settings: {
          connected_via: connectionMode,
          custom_app_manual_connected_at:
            connectionMode === "custom_app_manual" ? now : null,
          custom_app_client_credentials_connected_at:
            connectionMode === "custom_app_client_credentials" ? now : null,
          shop_domain: shopDomain,
          shopify_shop_id: shopInfo.id ? String(shopInfo.id) : null,
        },
        status: "active",
        store_id: storeId,
      },
      { onConflict: "store_id,provider" },
    )
    .select("id")
    .single();

  if (integrationError || !integration?.id) {
    return jsonResponse(
      {
        error: "luup_integration_save_failed",
        message: integrationError?.message || null,
      },
      500,
    );
  }

  const { error: secretError } = await supabase
    .from("integration_secrets")
    .upsert(
      {
        access_token: tokenForValidation,
        external_store_id: shopDomain,
        integration_id: integration.id,
        metadata: {
          access_token_expires_at: expiresAt(tokenData?.expires_in),
          client_id: clientId || null,
          client_secret: clientSecret || null,
          connected_via: connectionMode,
          non_expiring_admin_token: connectionMode === "custom_app_manual",
          shop_domain: shopDomain,
          source: connectionMode,
        },
        provider: "shopify",
        scope: tokenData?.scope || "read_products,read_inventory,read_locations",
        token_type:
          connectionMode === "custom_app_manual"
            ? "admin_api_access_token"
            : "bearer",
      },
      { onConflict: "integration_id" },
    );

  if (secretError) {
    return jsonResponse(
      {
        error: "luup_integration_secret_save_failed",
        message: secretError.message,
      },
      500,
    );
  }

  await supabase
    .from("stores")
    .update({ platform: "shopify", url: storeUrl })
    .eq("id", storeId);

  return jsonResponse({
    integration_id: integration.id,
    ok: true,
    shop_domain: shopDomain,
    shop_name: shopInfo.name || shopDomain,
  });
});
