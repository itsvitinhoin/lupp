import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type LocalizedValue = string | Record<string, string | null | undefined> | null | undefined;

type NuvemshopVariant = {
  price?: string | number | null;
  promotional_price?: string | number | null;
};

type NuvemshopProduct = {
  description?: LocalizedValue;
  handle?: LocalizedValue;
  id: number | string;
  images?: Array<{ src?: string | null }>;
  name?: LocalizedValue;
  published?: boolean;
  variants?: NuvemshopVariant[];
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function pickLocalized(value: LocalizedValue) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.pt || value["pt-BR"] || value.es || value.en || Object.values(value).find(Boolean) || "";
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toNumber(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getProductPrices(product: NuvemshopProduct) {
  const variant = product.variants?.[0];
  const price = toNumber(variant?.promotional_price) ?? toNumber(variant?.price);
  const compareAtPrice = toNumber(variant?.promotional_price) ? toNumber(variant?.price) : null;
  return { compareAtPrice, price };
}

function buildProductUrl(externalStoreId: string, product: NuvemshopProduct) {
  const handle = pickLocalized(product.handle);
  if (!handle) return null;
  return `https://${externalStoreId}.lojavirtualnuvem.com.br/produtos/${handle}/`;
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
  const appUserAgent = Deno.env.get("NUVEMSHOP_USER_AGENT") || "Luup (suporte@luup.app)";

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

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, external_store_id, settings")
    .eq("store_id", storeId)
    .eq("provider", "nuvemshop")
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.id || !integration.external_store_id) {
    return jsonResponse({ error: "nuvemshop_not_connected" }, 400);
  }

  const { data: secret } = await supabase
    .from("integration_secrets")
    .select("access_token")
    .eq("integration_id", integration.id)
    .maybeSingle();

  if (!secret?.access_token) {
    return jsonResponse({ error: "missing_nuvemshop_access_token" }, 400);
  }

  const externalStoreId = String(integration.external_store_id);
  const syncedProducts: Array<Record<string, unknown> & { external_id: string }> = [];
  let nextUrl: string | null = `https://api.nuvemshop.com.br/2025-03/${externalStoreId}/products?page=1&per_page=100`;
  let pages = 0;

  while (nextUrl && pages < 10) {
    pages += 1;
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${secret.access_token}`,
        "Content-Type": "application/json",
        "User-Agent": appUserAgent,
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return jsonResponse(
        {
          details: details.slice(0, 500),
          error: "nuvemshop_products_fetch_failed",
          status: response.status,
        },
        502,
      );
    }

    const products = (await response.json()) as NuvemshopProduct[];
    syncedProducts.push(
      ...products.map((product) => {
        const { compareAtPrice, price } = getProductPrices(product);
        return {
          compare_at_price: compareAtPrice,
          currency: "BRL",
          description: stripHtml(pickLocalized(product.description)),
          external_id: String(product.id),
          image_url: product.images?.[0]?.src || null,
          name: pickLocalized(product.name) || `Produto ${product.id}`,
          platform: "nuvemshop",
          price,
          product_url: buildProductUrl(externalStoreId, product),
          status: product.published === false ? "draft" : "active",
          store_id: storeId,
        };
      }),
    );

    const linkHeader = response.headers.get("link") || "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch?.[1] || null;
  }

  if (syncedProducts.length) {
    const externalIds = syncedProducts.map((product) => product.external_id);
    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, external_id")
      .eq("store_id", storeId)
      .eq("platform", "nuvemshop")
      .in("external_id", externalIds);

    const existingIds = new Map(
      (existingProducts ?? []).map((product: { external_id: string | null; id: string }) => [product.external_id, product.id]),
    );
    const productsToSave = syncedProducts.map((product) => ({
      ...product,
      ...(existingIds.get(product.external_id) ? { id: existingIds.get(product.external_id) } : {}),
    }));

    const { error: upsertError } = await supabase
      .from("products")
      .upsert(productsToSave);

    if (upsertError) {
      return jsonResponse({ error: "luup_products_upsert_failed" }, 500);
    }
  }

  const settings =
    integration.settings && typeof integration.settings === "object" && !Array.isArray(integration.settings)
      ? integration.settings
      : {};

  await supabase
    .from("integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      settings: {
        ...settings,
        last_product_sync_count: syncedProducts.length,
        last_product_sync_pages: pages,
      },
    })
    .eq("id", integration.id);

  return jsonResponse({ count: syncedProducts.length, ok: true, pages });
});
