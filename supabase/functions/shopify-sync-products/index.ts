import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { resolveShopifyAppConfig } from "../_shared/shopify-app-config.ts";

type ShopifyMoney = string | number | null | undefined;

type ShopifyVariantNode = {
  availableForSale?: boolean | null;
  compareAtPrice?: ShopifyMoney;
  id: string;
  image?: { url?: string | null } | null;
  inventoryQuantity?: number | null;
  legacyResourceId?: string | number | null;
  price?: ShopifyMoney;
  selectedOptions?: Array<{
    name?: string | null;
    value?: string | null;
  }> | null;
  sku?: string | null;
  title?: string | null;
};

type ShopifyProductNode = {
  descriptionHtml?: string | null;
  featuredImage?: { url?: string | null } | null;
  handle?: string | null;
  id: string;
  legacyResourceId?: string | number | null;
  onlineStoreUrl?: string | null;
  status?: string | null;
  title?: string | null;
  variants?: {
    edges?: Array<{ node?: ShopifyVariantNode | null }>;
  } | null;
};

type ShopifyProductsResponse = {
  data?: {
    products?: {
      edges?: Array<{ cursor?: string; node?: ShopifyProductNode | null }>;
      pageInfo?: {
        endCursor?: string | null;
        hasNextPage?: boolean;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type ShopifyTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

type ShopifySecretRow = {
  access_token: string;
  metadata?: unknown;
  scope?: string | null;
  token_type?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const PRODUCTS_QUERY = `
  query LuupProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          id
          legacyResourceId
          title
          handle
          descriptionHtml
          status
          onlineStoreUrl
          featuredImage {
            url
          }
          variants(first: 100) {
            edges {
              node {
                id
                legacyResourceId
                title
                sku
                price
                compareAtPrice
                availableForSale
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function stripHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: ShopifyMoney) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueByExternalId<T extends { external_id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.external_id, item);
  }
  return Array.from(map.values());
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const payload = error as Record<string, unknown>;
  return {
    code: typeof payload.code === "string" ? payload.code : null,
    details: typeof payload.details === "string" ? payload.details : null,
    hint: typeof payload.hint === "string" ? payload.hint : null,
    message:
      typeof payload.message === "string" ? payload.message : String(error),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function expiresAt(seconds: number | undefined) {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
}

function isExpiredOrMissing(value: unknown, skewMs = 120_000) {
  if (typeof value !== "string" || !value) return true;
  const expiresAtMs = new Date(value).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + skewMs;
}

function buildTokenMetadata(
  tokenData: ShopifyTokenResponse,
  previousMetadata: unknown,
  shop: string,
) {
  const metadata = asRecord(previousMetadata);
  return {
    ...metadata,
    access_token_expires_at: expiresAt(tokenData.expires_in),
    expiring_offline: Boolean(
      tokenData.refresh_token || metadata.refresh_token,
    ),
    refresh_token: tokenData.refresh_token || metadata.refresh_token || null,
    refresh_token_expires_at:
      expiresAt(tokenData.refresh_token_expires_in) ||
      metadata.refresh_token_expires_at ||
      null,
    shop_domain: shop,
  };
}

function normalizeOptionName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findSelectedOption(variant: ShopifyVariantNode, patterns: RegExp[]) {
  const options = Array.isArray(variant.selectedOptions)
    ? variant.selectedOptions
    : [];
  const option = options.find((item) => {
    const normalized = normalizeOptionName(item.name);
    return patterns.some((pattern) => pattern.test(normalized));
  });
  return option?.value || "";
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
  azul: "#0000DC",
  branco: "#FFFFFF",
  cinza: "#9CA3AF",
  fucsia: "#CE3B72",
  laranja: "#F97316",
  marrom: "#7A4A2A",
  preto: "#000000",
  rosa: "#F7A8C7",
  roxo: "#7E22CE",
  verde: "#3F7D20",
  vermelho: "#FF0000",
};

function colorNameToHex(value: string | null | undefined) {
  const normalized = normalizeColorName(value);
  return normalized ? COLOR_HEX_BY_NAME[normalized] || null : null;
}

function isActiveProduct(status: string | null | undefined) {
  return String(status || "").toLowerCase() === "active";
}

function buildProductUrl(shop: string, product: ShopifyProductNode) {
  if (product.onlineStoreUrl) return product.onlineStoreUrl;
  if (product.handle) return `https://${shop}/products/${product.handle}`;
  return `https://${shop}`;
}

function getProductPrice(product: ShopifyProductNode) {
  const variant = product.variants?.edges?.[0]?.node;
  return {
    compareAtPrice: toNumber(variant?.compareAtPrice),
    price: toNumber(variant?.price),
  };
}

function buildSyncedProduct(
  product: ShopifyProductNode,
  shop: string,
  storeId: string,
) {
  const externalId = product.legacyResourceId
    ? String(product.legacyResourceId)
    : product.id;
  const { compareAtPrice, price } = getProductPrice(product);
  return {
    compare_at_price: compareAtPrice,
    currency: "BRL",
    description: stripHtml(product.descriptionHtml),
    external_id: externalId,
    image_url: product.featuredImage?.url || null,
    name: product.title || `Produto ${externalId}`,
    platform: "shopify",
    price,
    product_url: buildProductUrl(shop, product),
    status: isActiveProduct(product.status) ? "active" : "draft",
    store_id: storeId,
  };
}

function normalizeVariant(
  product: ShopifyProductNode,
  storeId: string,
  productId: string,
) {
  return (product.variants?.edges ?? [])
    .map((edge) => edge.node)
    .filter((variant): variant is ShopifyVariantNode => Boolean(variant?.id))
    .map((variant, index) => {
      const externalId = variant.legacyResourceId
        ? String(variant.legacyResourceId)
        : variant.id;
      const colorName = findSelectedOption(variant, [
        /cor/i,
        /color/i,
        /colou?r/i,
      ]);
      const sizeName =
        findSelectedOption(variant, [/tam/i, /tamanho/i, /size/i]) ||
        variant.title ||
        "Unico";
      return {
        asset_id: null,
        color_code: colorName || null,
        color_hex: colorNameToHex(colorName),
        color_name: colorName || null,
        compare_at_price: toNumber(variant.compareAtPrice),
        external_id: externalId,
        image_url: variant.image?.url || product.featuredImage?.url || null,
        metadata: {
          admin_gid: variant.id,
          available_for_sale: variant.availableForSale ?? null,
          color_index: colorName ? index : null,
          product_admin_gid: product.id,
          raw_selected_options: variant.selectedOptions ?? [],
          size_index: index,
        },
        platform: "shopify",
        price: toNumber(variant.price),
        product_id: productId,
        size_code: sizeName || "Unico",
        size_name: sizeName || "Unico",
        sku: variant.sku || null,
        status: isActiveProduct(product.status) ? "active" : "draft",
        stock_qty:
          typeof variant.inventoryQuantity === "number"
            ? Math.trunc(variant.inventoryQuantity)
            : null,
        store_id: storeId,
      };
    });
}

async function fetchShopifyProducts({
  accessToken,
  apiVersion,
  cursor,
  shop,
}: {
  accessToken: string;
  apiVersion: string;
  cursor: string | null;
  shop: string;
}) {
  const response = await fetch(
    `https://${shop}/admin/api/${apiVersion}/graphql.json`,
    {
      body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { cursor } }),
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      method: "POST",
    },
  );

  const payload = (await response
    .json()
    .catch(() => ({}))) as ShopifyProductsResponse;
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(" | ") || `shopify_products_fetch_failed:${response.status}`,
    );
  }
  return payload;
}

async function requestShopifyToken({
  apiKey,
  apiSecret,
  body,
  shop,
}: {
  apiKey: string;
  apiSecret: string;
  body: Record<string, string>;
  shop: string;
}) {
  const tokenBody = new URLSearchParams({
    client_id: apiKey,
    client_secret: apiSecret,
    ...body,
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
    throw new Error(
      payload.error_description ||
        payload.error ||
        `shopify_token_request_failed:${response.status}`,
    );
  }
  return payload;
}

async function updateShopifySecret({
  integrationId,
  metadata,
  supabase,
  tokenData,
}: {
  integrationId: string;
  metadata: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  supabase: any;
  tokenData: ShopifyTokenResponse;
}) {
  const { error } = await supabase
    .from("integration_secrets")
    .update({
      access_token: tokenData.access_token,
      metadata,
      scope: tokenData.scope || null,
      token_type: "bearer",
    })
    .eq("integration_id", integrationId);
  if (error) throw new Error(error.message || "shopify_token_save_failed");
}

async function ensureShopifyAccessToken({
  apiKey,
  apiSecret,
  integrationId,
  secret,
  shop,
  supabase,
}: {
  apiKey: string;
  apiSecret: string;
  integrationId: string;
  secret: ShopifySecretRow;
  shop: string;
  // deno-lint-ignore no-explicit-any
  supabase: any;
}) {
  const metadata = asRecord(secret.metadata);
  const isManualCustomAppToken =
    secret.token_type === "admin_api_access_token" ||
    metadata.non_expiring_admin_token === true ||
    metadata.source === "custom_app_manual" ||
    metadata.connected_via === "custom_app_manual";

  if (isManualCustomAppToken) {
    return secret.access_token;
  }

  const isClientCredentialsToken =
    metadata.source === "custom_app_client_credentials" ||
    metadata.connected_via === "custom_app_client_credentials";
  const clientCredentialsId =
    typeof metadata.client_id === "string" ? metadata.client_id : "";
  const clientCredentialsSecret =
    typeof metadata.client_secret === "string" ? metadata.client_secret : "";
  const refreshToken =
    typeof metadata.refresh_token === "string" ? metadata.refresh_token : "";
  const accessExpiresAt = metadata.access_token_expires_at;

  if (!isExpiredOrMissing(accessExpiresAt)) {
    return secret.access_token;
  }

  const tokenData = isClientCredentialsToken
    ? await requestShopifyToken({
        apiKey: clientCredentialsId || apiKey,
        apiSecret: clientCredentialsSecret || apiSecret,
        body: {
          grant_type: "client_credentials",
        },
        shop,
      })
    : refreshToken
      ? await requestShopifyToken({
        apiKey,
        apiSecret,
        body: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        shop,
      })
      : await requestShopifyToken({
        apiKey,
        apiSecret,
        body: {
          expiring: "1",
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          requested_token_type:
            "urn:shopify:params:oauth:token-type:offline-access-token",
          subject_token: secret.access_token,
          subject_token_type:
            "urn:shopify:params:oauth:token-type:offline-access-token",
        },
        shop,
      });

  const nextMetadata = buildTokenMetadata(tokenData, secret.metadata, shop);
  await updateShopifySecret({
    integrationId,
    metadata: nextMetadata,
    supabase,
    tokenData,
  });
  return tokenData.access_token || secret.access_token;
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
    .eq("provider", "shopify")
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.id || !integration.external_store_id) {
    return jsonResponse({ error: "shopify_not_connected" }, 400);
  }

  const { data: secret } = await supabase
    .from("integration_secrets")
    .select("access_token, metadata, scope, token_type")
    .eq("integration_id", integration.id)
    .maybeSingle<ShopifySecretRow>();

  if (!secret?.access_token) {
    return jsonResponse({ error: "missing_shopify_access_token" }, 400);
  }

  const shop = String(integration.external_store_id);
  const secretMetadata = asRecord(secret.metadata);
  const isManualCustomAppToken =
    secret.token_type === "admin_api_access_token" ||
    secretMetadata.non_expiring_admin_token === true ||
    secretMetadata.source === "custom_app_manual" ||
    secretMetadata.connected_via === "custom_app_manual";

  let accessToken = secret.access_token;
  if (!isManualCustomAppToken) {
    const appConfig = resolveShopifyAppConfig({ shop });
    if (!appConfig) {
      return jsonResponse({ error: "missing_shopify_app_config" }, 500);
    }

    try {
      accessToken = await ensureShopifyAccessToken({
        apiKey: appConfig.apiKey,
        apiSecret: appConfig.apiSecret,
        integrationId: integration.id,
        secret,
        shop,
        supabase,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: "shopify_token_refresh_failed",
          message: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }
  }

  const allProducts: ShopifyProductNode[] = [];
  const syncedProducts: Array<
    Record<string, unknown> & { external_id: string }
  > = [];
  let cursor: string | null = null;
  let pages = 0;

  try {
    while (pages < 20) {
      pages += 1;
      const payload = await fetchShopifyProducts({
        accessToken,
        apiVersion,
        cursor,
        shop,
      });
      const products = payload.data?.products;
      const edges = products?.edges ?? [];
      allProducts.push(
        ...(edges
          .map((edge) => edge.node)
          .filter(Boolean) as ShopifyProductNode[]),
      );
      for (const edge of edges) {
        const product = edge.node;
        if (!product?.id) continue;
        syncedProducts.push(buildSyncedProduct(product, shop, storeId));
      }
      if (!products?.pageInfo?.hasNextPage) break;
      cursor = products.pageInfo.endCursor || null;
      if (!cursor) break;
    }
  } catch (graphqlError) {
    return jsonResponse(
      {
        error: "shopify_products_fetch_failed",
        message:
          graphqlError instanceof Error
            ? graphqlError.message
            : String(graphqlError),
        sync_mode: "graphql",
      },
      502,
    );
  }

  let syncedVariantsCount = 0;
  if (syncedProducts.length) {
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
      .eq("platform", "shopify")
      .in(
        "external_id",
        productsToSave.map((product) => product.external_id),
      );

    const savedProductIds = new Map(
      (savedProducts ?? []).map(
        (product: { external_id: string | null; id: string }) => [
          product.external_id,
          product.id,
        ],
      ),
    );
    const variantsToSave = uniqueByExternalId(
      allProducts.flatMap((product) => {
        const externalId = product.legacyResourceId
          ? String(product.legacyResourceId)
          : product.id;
        const productId = savedProductIds.get(externalId);
        return productId ? normalizeVariant(product, storeId, productId) : [];
      }),
    );
    syncedVariantsCount = variantsToSave.length;

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

  const settings =
    integration.settings &&
    typeof integration.settings === "object" &&
    !Array.isArray(integration.settings)
      ? integration.settings
      : {};

  await supabase
    .from("integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      settings: {
        ...settings,
        last_product_sync_count: syncedProducts.length,
        last_product_sync_mode: "graphql",
        last_product_sync_pages: pages,
        shop_domain: shop,
      },
    })
    .eq("id", integration.id);

  return jsonResponse({
    count: syncedProducts.length,
    ok: true,
    pages,
    shop_domain: shop,
    sync_mode: "graphql",
    variants_count: syncedVariantsCount,
  });
});
