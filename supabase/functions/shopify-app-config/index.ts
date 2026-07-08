import {
  normalizeShopDomain,
  resolveShopifyAppConfig,
} from "../_shared/shopify-app-config.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const shop = normalizeShopDomain(body?.shop);
  const config = resolveShopifyAppConfig({ shop });
  if (!config?.apiKey) {
    return jsonResponse({ error: "missing_shopify_app_config" }, 500);
  }

  return jsonResponse({
    api_key: config.apiKey,
    shop,
  });
});
