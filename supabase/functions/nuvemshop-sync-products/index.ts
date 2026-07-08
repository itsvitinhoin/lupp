import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type LocalizedValue = string | Record<string, string | null | undefined> | null | undefined;

type NuvemshopVariant = {
  available?: boolean | null;
  compare_at_price?: string | number | null;
  compare_at_price_long?: string | null;
  compare_at_price_number?: number | null;
  compare_at_price_number_raw?: number | null;
  compare_at_price_short?: string | null;
  contact?: boolean | null;
  has_promotional_price?: boolean | null;
  id?: number | string;
  image_id?: number | string | null;
  image?: { src?: string | null } | number | string | null;
  image_url?: string | null;
  installments_data?: string | unknown[] | Record<string, unknown> | null;
  is_visible?: boolean | null;
  option0?: string | null;
  option1?: string | null;
  option2?: string | null;
  popup_discount_visibility?: unknown[] | null;
  price?: string | number | null;
  price_long?: string | null;
  price_number?: number | null;
  price_number_raw?: number | null;
  price_short?: string | null;
  price_with_payment_discount_short?: string | null;
  price_without_taxes?: string | null;
  promotional_price_number?: number | null;
  promotional_price_short?: string | null;
  promotional_price?: string | number | null;
  show_payment_discount_disclaimer?: boolean | null;
  sku?: string | null;
  stock?: string | number | null;
  stock_management?: boolean | null;
  values?: LocalizedValue[];
};

type NuvemshopProduct = {
  attributes?: LocalizedValue[];
  description?: LocalizedValue;
  handle?: LocalizedValue;
  id: number | string;
  images?: Array<{ id?: number | string | null; src?: string | null }>;
  name?: LocalizedValue;
  published?: boolean;
  variants?: NuvemshopVariant[];
};

type NuvemshopStore = {
  domains?: string[] | null;
  original_domain?: string | null;
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

function normalizeColorName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COLOR_HEX_BY_NAME: Record<string, string> = {
  amarelo: "#FFEE02",
  "azul claro": "#00BFFF",
  "azul marinho": "#123A8C",
  "azul petroleo": "#1F8BC7",
  "azul royal": "#003CFF",
  azul: "#0000DC",
  bege: "#F5F5DC",
  branco: "#FFFFFF",
  caramelo: "#C47A32",
  cinza: "#9CA3AF",
  fucsia: "#CE3B72",
  laranja: "#F97316",
  lavanda: "#C4B5FD",
  lilas: "#C084FC",
  marrom: "#7A4A2A",
  marsala: "#7B1E3A",
  nude: "#E8C7B8",
  off: "#F8F7F2",
  "off white": "#F8F7F2",
  preto: "#000000",
  rosa: "#F7A8C7",
  rose: "#D9A0A7",
  roxo: "#7E22CE",
  verde: "#3F7D20",
  "verde oliva": "#4B6F29",
  vermelho: "#FF0000",
};

function colorNameToHex(value: string | null | undefined) {
  const normalized = normalizeColorName(value);
  return normalized ? COLOR_HEX_BY_NAME[normalized] || null : null;
}

function parseInstallmentsData(value: string | unknown[] | Record<string, unknown> | null | undefined) {
  if (!value) return null;
  if (Array.isArray(value) || typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function formatMoney(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(numeric);
}

function readNumberField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function buildInstallmentText(variant: NuvemshopVariant) {
  const installmentsData = parseInstallmentsData(variant.installments_data);
  let best: { quantity: number; amount: string; interestFree: boolean } | null = null;
  const rows: Array<{ quantity: number; payload: Record<string, unknown> }> = [];

  if (Array.isArray(installmentsData)) {
    installmentsData.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      rows.push({ payload: row as Record<string, unknown>, quantity: index + 1 });
    });
  } else if (installmentsData && typeof installmentsData === "object") {
    Object.values(installmentsData).forEach((installmentsByMethod) => {
      if (!installmentsByMethod || typeof installmentsByMethod !== "object") return;
      Object.entries(installmentsByMethod as Record<string, unknown>).forEach(([quantity, payload]) => {
        if (!payload || typeof payload !== "object") return;
        const parsedQuantity = Number(quantity);
        if (!Number.isFinite(parsedQuantity)) return;
        rows.push({ payload: payload as Record<string, unknown>, quantity: parsedQuantity });
      });
    });
  }

  for (const row of rows) {
    const payload = row.payload;
    const quantity = readNumberField(payload, ["installments", "quantity", "count"]) ?? row.quantity;
    const installmentAmount =
      formatMoney(payload.installment_value) ||
      formatMoney(payload.value) ||
      formatMoney(payload.amount);
    if (!quantity || !installmentAmount) continue;
    const hasInterest = Boolean(payload.has_interest ?? payload.with_interest ?? payload.interest);
    if (!best || (!hasInterest && best.interestFree === false) || quantity > best.quantity) {
      best = { amount: installmentAmount, interestFree: !hasInterest, quantity };
    }
  }

  if (!best) return null;
  return `${best.quantity} x de ${best.amount}${best.interestFree ? " sem juros" : ""}`;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const payload = error as Record<string, unknown>;
  return {
    code: typeof payload.code === "string" ? payload.code : null,
    details: typeof payload.details === "string" ? payload.details : null,
    hint: typeof payload.hint === "string" ? payload.hint : null,
    message: typeof payload.message === "string" ? payload.message : String(error),
  };
}

function uniqueByExternalId<T extends { external_id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.external_id, item);
  }
  return Array.from(map.values());
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getProductPrices(product: NuvemshopProduct) {
  const variant = product.variants?.[0];
  const price = toNumber(variant?.promotional_price) ?? toNumber(variant?.price);
  const compareAtPrice = toNumber(variant?.compare_at_price) ?? (toNumber(variant?.promotional_price) ? toNumber(variant?.price) : null);
  return { compareAtPrice, price };
}

function attributeIndex(product: NuvemshopProduct, patterns: RegExp[]) {
  const attributes = Array.isArray(product.attributes) ? product.attributes : [];
  return attributes.findIndex((attribute) => {
    const name = pickLocalized(attribute);
    return patterns.some((pattern) => pattern.test(name));
  });
}

function variantValue(variant: NuvemshopVariant, index: number) {
  if (index < 0 || !Array.isArray(variant.values)) return "";
  return pickLocalized(variant.values[index]);
}

function pickVariantOption(product: NuvemshopProduct, variant: NuvemshopVariant, kind: "color" | "size") {
  const values = Array.isArray(variant.values) ? variant.values.map(pickLocalized).filter(Boolean) : [];
  const colorIndex = attributeIndex(product, [/cor/i, /color/i, /colou?r/i]);
  const sizeIndex = attributeIndex(product, [/tam/i, /tamanho/i, /size/i]);

  if (kind === "color") {
    return variantValue(variant, colorIndex) || variant.option0 || (values.length > 1 ? values[0] : "");
  }

  return variantValue(variant, sizeIndex) || variant.option1 || (values.length > 1 ? values[1] : values[0] || "Unico");
}

function pickVariantImage(product: NuvemshopProduct, variant: NuvemshopVariant) {
  if (variant.image_url) return variant.image_url.replace(/^\/\//, "https://");
  if (variant.image && typeof variant.image === "object" && "src" in variant.image && variant.image.src) {
    return variant.image.src;
  }
  const imageId = variant.image_id === undefined || variant.image_id === null ? "" : String(variant.image_id);
  if (imageId && Array.isArray(product.images)) {
    const image = product.images.find((item) => String(item.id || "") === imageId);
    if (image?.src) return image.src;
  }
  return product.images?.[0]?.src || null;
}

function normalizeVariant(product: NuvemshopProduct, storeId: string, productId: string) {
  return (product.variants ?? [])
    .filter((variant) => variant.id !== undefined && variant.id !== null)
    .map((variant, index) => {
      const price = toNumber(variant.promotional_price) ?? toNumber(variant.price);
      const compareAtPrice = toNumber(variant.compare_at_price) ?? (toNumber(variant.promotional_price) ? toNumber(variant.price) : null);
      const colorName = pickVariantOption(product, variant, "color");
      const sizeName = pickVariantOption(product, variant, "size");
      const stockQty = variant.stock_management === false ? null : toNumber(variant.stock);
      const installmentText = buildInstallmentText(variant);
      const pixDiscountText = variant.price_with_payment_discount_short
        ? `No Pix: ${variant.price_with_payment_discount_short}`
        : null;

      return {
        asset_id: null,
        color_code: colorName || null,
        color_hex: colorNameToHex(colorName),
        color_name: colorName || null,
        compare_at_price: compareAtPrice,
        external_id: String(variant.id),
        image_url: pickVariantImage(product, variant),
        metadata: {
          available: variant.available ?? null,
          color_index: colorName ? index : null,
          compare_at_price_long: variant.compare_at_price_long ?? null,
          compare_at_price_short: variant.compare_at_price_short ?? null,
          contact: variant.contact ?? null,
          has_promotional_price: variant.has_promotional_price ?? null,
          installment_text: installmentText,
          installments_data: variant.installments_data ?? null,
          is_visible: variant.is_visible ?? null,
          option0: variant.option0 ?? null,
          option1: variant.option1 ?? null,
          option2: variant.option2 ?? null,
          payment_terms: [installmentText, pixDiscountText].filter(Boolean),
          pix_discount_text: pixDiscountText,
          popup_discount_visibility: variant.popup_discount_visibility ?? null,
          price_long: variant.price_long ?? null,
          price_number: variant.price_number ?? null,
          price_number_raw: variant.price_number_raw ?? null,
          price_short: variant.price_short ?? null,
          price_with_payment_discount_short: variant.price_with_payment_discount_short ?? null,
          price_without_taxes: variant.price_without_taxes ?? null,
          promotional_price_short: variant.promotional_price_short ?? null,
          raw_values: Array.isArray(variant.values) ? variant.values.map(pickLocalized) : [],
          show_payment_discount_disclaimer: variant.show_payment_discount_disclaimer ?? null,
          size_index: index,
          stock_management: variant.stock_management ?? null,
        },
        platform: "nuvemshop",
        price,
        product_id: productId,
        size_code: sizeName || "Unico",
        size_name: sizeName || "Unico",
        sku: variant.sku || null,
        status: product.published === false ? "draft" : "active",
        stock_qty: stockQty === null ? null : Math.trunc(stockQty),
        store_id: storeId,
      };
    });
}

function normalizeStoreDomain(value: string | null | undefined) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/+$/, "");
}

function pickStorefrontDomain(store: NuvemshopStore | null, externalStoreId: string) {
  const domains = Array.isArray(store?.domains) ? store?.domains ?? [] : [];
  const primaryDomain = domains.map(normalizeStoreDomain).find(Boolean);
  return primaryDomain || normalizeStoreDomain(store?.original_domain) || `${externalStoreId}.lojavirtualnuvem.com.br`;
}

function buildProductUrl(storefrontDomain: string, product: NuvemshopProduct) {
  const handle = pickLocalized(product.handle);
  if (!handle) return null;
  return `https://${storefrontDomain}/produtos/${handle}/`;
}

async function fetchNuvemshopStore(apiBase: string, accessToken: string, appUserAgent: string) {
  const response = await fetch(`${apiBase}/store`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": appUserAgent,
    },
  });

  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as NuvemshopStore | null;
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
  const apiBase = `https://api.nuvemshop.com.br/2025-03/${externalStoreId}`;
  const nuvemshopStore = await fetchNuvemshopStore(apiBase, secret.access_token, appUserAgent);
  const storefrontDomain = pickStorefrontDomain(nuvemshopStore, externalStoreId);
  const allProducts: NuvemshopProduct[] = [];
  const syncedProducts: Array<Record<string, unknown> & { external_id: string }> = [];
  let syncedVariantsCount = 0;
  let nextUrl: string | null = `${apiBase}/products?page=1&per_page=100`;
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
    allProducts.push(...products);
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
          product_url: buildProductUrl(storefrontDomain, product),
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
    const productsToSave = uniqueByExternalId(syncedProducts);

    for (const productChunk of chunk(productsToSave, 50)) {
      const { error: upsertError } = await supabase
        .from("products")
        .upsert(productChunk, { onConflict: "store_id,platform,external_id" });

      if (upsertError) {
        return jsonResponse(
          {
            details: errorDetails(upsertError),
            error: "luup_products_upsert_failed",
            products_attempted: productChunk.length,
          },
          500,
        );
      }
    }

    const { data: savedProducts } = await supabase
      .from("products")
      .select("id, external_id")
      .eq("store_id", storeId)
      .eq("platform", "nuvemshop")
      .in("external_id", externalIds);

    const savedProductIds = new Map(
      (savedProducts ?? []).map((product: { external_id: string | null; id: string }) => [product.external_id, product.id]),
    );
    const variantsToSave = uniqueByExternalId(allProducts.flatMap((product) => {
      const productId = savedProductIds.get(String(product.id));
      return productId ? normalizeVariant(product, storeId, productId) : [];
    }));
    syncedVariantsCount = variantsToSave.length;

    if (variantsToSave.length) {
      for (const variantChunk of chunk(variantsToSave, 100)) {
        const { error: variantsError } = await supabase
          .from("product_variants")
          .upsert(variantChunk, { onConflict: "store_id,platform,external_id" });

        if (variantsError) {
          return jsonResponse(
            {
              details: errorDetails(variantsError),
              error: "luup_product_variants_upsert_failed",
              variants_attempted: variantChunk.length,
            },
            500,
          );
        }
      }
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
        nuvemshop_domains: Array.isArray(nuvemshopStore?.domains) ? nuvemshopStore?.domains : [],
        nuvemshop_original_domain: nuvemshopStore?.original_domain || null,
        storefront_domain: storefrontDomain,
      },
    })
    .eq("id", integration.id);

  return jsonResponse({ count: syncedProducts.length, ok: true, pages, storefront_domain: storefrontDomain, variants_count: syncedVariantsCount });
});
