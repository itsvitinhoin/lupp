import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { runInBatches } from "@/lib/batch";
import {
  requestShopifyAccessToken,
  resolveShopifyAppConfig,
  shopifyGraphql,
  shopifyTokenExpiresAt,
  ShopifyTokenResponse,
} from "@/lib/shopify";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

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

type ShopifySecret = {
  access_token: string;
  metadata?: unknown;
  scope?: string | null;
  token_type?: string | null;
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

// Ported from supabase/functions/shopify-sync-products.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose catalog is synced."),
});

export const ShopifySyncProductsSchema = {
  schema: {
    summary: "Sync Shopify products",
    description:
      "Pulls the store's Shopify catalog through the Admin GraphQL API (paginated, up to 20 " +
      "pages of 50 products) and upserts products + variants. Expired OAuth tokens are " +
      "refreshed first (refresh token, client credentials or token exchange, depending on how " +
      "the integration was connected) and the new token is persisted.",
    tags: ["shopify"],
    operationId: "shopifySyncProducts",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        count: z.number(),
        ok: z.boolean(),
        pages: z.number(),
        shop_domain: z.string(),
        sync_mode: z.string(),
        variants_count: z.number(),
      }),
      ...edgeErrorSchemas,
      500: z.object({
        details: z.any().optional(),
        error: z.string(),
        products_attempted: z.number().optional(),
        variants_attempted: z.number().optional(),
      }),
      502: z.object({
        error: z.string(),
        message: z.string().optional(),
        sync_mode: z.string().optional(),
      }),
    },
  },
};

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
    access_token_expires_at: shopifyTokenExpiresAt(tokenData.expires_in),
    expiring_offline: Boolean(
      tokenData.refresh_token || metadata.refresh_token,
    ),
    refresh_token: tokenData.refresh_token || metadata.refresh_token || null,
    refresh_token_expires_at:
      shopifyTokenExpiresAt(tokenData.refresh_token_expires_in) ||
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
    status: (isActiveProduct(product.status) ? "active" : "draft") as
      | "active"
      | "draft",
    store_id: storeId,
  };
}

function normalizeVariants(
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
        status: (isActiveProduct(product.status) ? "active" : "draft") as
          | "active"
          | "draft",
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
  cursor,
  shop,
}: {
  accessToken: string;
  cursor: string | null;
  shop: string;
}) {
  const result = await shopifyGraphql(shop, accessToken, PRODUCTS_QUERY, {
    cursor,
  });
  const payload = result.payload as ShopifyProductsResponse;
  if (!result.ok || payload.errors?.length) {
    throw new Error(
      payload.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(" | ") || `shopify_products_fetch_failed:${result.status}`,
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
  const result = await requestShopifyAccessToken(shop, {
    client_id: apiKey,
    client_secret: apiSecret,
    ...body,
  });
  if (!result.ok || !result.payload.access_token) {
    throw new Error(
      result.payload.error_description ||
        result.payload.error ||
        `shopify_token_request_failed:${result.status}`,
    );
  }
  return result.payload;
}

/**
 * Refreshes the stored OAuth token when it's expired (or has no expiry info):
 * client-credentials custom apps re-request one, offline tokens use their
 * refresh_token, and legacy tokens go through Shopify's token exchange. The
 * new token + metadata are persisted on the integration secret.
 */
async function ensureShopifyAccessToken({
  apiKey,
  apiSecret,
  integrationId,
  secret,
  shop,
}: {
  apiKey: string;
  apiSecret: string;
  integrationId: string;
  secret: ShopifySecret;
  shop: string;
}) {
  const metadata = asRecord(secret.metadata);
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

  await prisma.integrationSecret.update({
    where: { integration_id: integrationId },
    data: {
      access_token: tokenData.access_token,
      metadata: buildTokenMetadata(tokenData, secret.metadata, shop),
      scope: tokenData.scope || null,
      token_type: "bearer",
    },
  });
  return tokenData.access_token || secret.access_token;
}

function isManualCustomAppToken(secret: ShopifySecret) {
  const metadata = asRecord(secret.metadata);
  return (
    secret.token_type === "admin_api_access_token" ||
    metadata.non_expiring_admin_token === true ||
    metadata.source === "custom_app_manual" ||
    metadata.connected_via === "custom_app_manual"
  );
}

export async function shopifySyncProductsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const integration = await prisma.integration.findFirst({
    where: { store_id: storeId, provider: "shopify", status: "active" },
    select: { id: true, external_store_id: true, settings: true },
  });

  if (!integration?.id || !integration.external_store_id) {
    return reply.status(400).send({ error: "shopify_not_connected" });
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { integration_id: integration.id },
    select: {
      access_token: true,
      metadata: true,
      scope: true,
      token_type: true,
    },
  });

  if (!secret?.access_token) {
    return reply.status(400).send({ error: "missing_shopify_access_token" });
  }

  const shop = String(integration.external_store_id);

  let accessToken = secret.access_token;
  if (!isManualCustomAppToken(secret)) {
    const appConfig = resolveShopifyAppConfig({ shop });
    if (!appConfig) {
      return reply.status(500).send({ error: "missing_shopify_app_config" });
    }

    try {
      accessToken = await ensureShopifyAccessToken({
        apiKey: appConfig.apiKey,
        apiSecret: appConfig.apiSecret,
        integrationId: integration.id,
        secret,
        shop,
      });
    } catch (error) {
      return reply.status(502).send({
        error: "shopify_token_refresh_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allProducts: ShopifyProductNode[] = [];
  const syncedProducts: Array<ReturnType<typeof buildSyncedProduct>> = [];
  let cursor: string | null = null;
  let pages = 0;

  try {
    while (pages < 20) {
      pages += 1;
      const payload = await fetchShopifyProducts({
        accessToken,
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
    return reply.status(502).send({
      error: "shopify_products_fetch_failed",
      message:
        graphqlError instanceof Error
          ? graphqlError.message
          : String(graphqlError),
      sync_mode: "graphql",
    });
  }

  let syncedVariantsCount = 0;
  if (syncedProducts.length) {
    const productsToSave = uniqueByExternalId(syncedProducts);
    try {
      await runInBatches(
        productsToSave.map((product) =>
          prisma.product.upsert({
            where: {
              store_id_platform_external_id: {
                store_id: storeId,
                platform: "shopify",
                external_id: product.external_id,
              },
            },
            create: product,
            update: product,
          }),
        ),
      );
    } catch (upsertError) {
      return reply.status(500).send({
        details: errorDetails(upsertError),
        error: "luup_products_upsert_failed",
        products_attempted: productsToSave.length,
      });
    }

    const savedProducts = await prisma.product.findMany({
      where: {
        store_id: storeId,
        platform: "shopify",
        external_id: { in: productsToSave.map((product) => product.external_id) },
      },
      select: { id: true, external_id: true },
    });

    const savedProductIds = new Map(
      savedProducts.map((product) => [product.external_id, product.id]),
    );
    const variantsToSave = uniqueByExternalId(
      allProducts.flatMap((product) => {
        const externalId = product.legacyResourceId
          ? String(product.legacyResourceId)
          : product.id;
        const productId = savedProductIds.get(externalId);
        return productId ? normalizeVariants(product, storeId, productId) : [];
      }),
    );
    syncedVariantsCount = variantsToSave.length;

    try {
      await runInBatches(
        variantsToSave.map((variant) =>
          prisma.productVariant.upsert({
            where: {
              store_id_platform_external_id: {
                store_id: storeId,
                platform: "shopify",
                external_id: variant.external_id,
              },
            },
            create: variant,
            update: variant,
          }),
        ),
      );
    } catch (variantsError) {
      return reply.status(500).send({
        details: errorDetails(variantsError),
        error: "luup_product_variants_upsert_failed",
        variants_attempted: variantsToSave.length,
      });
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      last_sync_at: new Date(),
      settings: {
        ...asRecord(integration.settings),
        last_product_sync_count: syncedProducts.length,
        last_product_sync_mode: "graphql",
        last_product_sync_pages: pages,
        shop_domain: shop,
      },
    },
  });

  return reply.status(200).send({
    count: syncedProducts.length,
    ok: true,
    pages,
    shop_domain: shop,
    sync_mode: "graphql",
    variants_count: syncedVariantsCount,
  });
}
