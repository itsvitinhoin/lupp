import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import {
  fetchShopifyShop,
  normalizeShopHandleOrDomain,
  requestShopifyAccessToken,
  shopifyTokenExpiresAt,
  ShopifyTokenResponse,
} from "@/lib/shopify";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

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

// Ported from supabase/functions/shopify-connect-custom-app. Field checks stay
// in the handler so the machine-readable error codes are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store to connect."),
  shop: z
    .string()
    .optional()
    .describe("Shop handle or *.myshopify.com domain."),
  shop_domain: z.string().optional().describe("Alias of shop."),
  access_token: z
    .string()
    .optional()
    .describe("Admin API access token (custom app, manual mode)."),
  admin_api_access_token: z
    .string()
    .optional()
    .describe("Alias of access_token."),
  client_id: z
    .string()
    .optional()
    .describe("Custom app client id (client-credentials mode)."),
  clientId: z.string().optional().describe("Alias of client_id."),
  client_secret: z
    .string()
    .optional()
    .describe("Custom app client secret (client-credentials mode)."),
  clientSecret: z.string().optional().describe("Alias of client_secret."),
});

const upstreamErrorSchema = z.object({
  error: z.string(),
  message: z.string().nullable().optional(),
  status: z.number().optional(),
});

export const ShopifyConnectCustomAppSchema = {
  schema: {
    summary: "Connect a Shopify custom app",
    description:
      "Connects a store to Shopify through a merchant-created custom app: either a manual " +
      "Admin API access token or client credentials (a token is requested on their behalf). " +
      "Validates the token against shop.json, then upserts the integration + secret and " +
      "stamps the store's platform/url.",
    tags: ["shopify"],
    operationId: "shopifyConnectCustomApp",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        integration_id: z.string(),
        ok: z.boolean(),
        shop_domain: z.string(),
        shop_name: z.string(),
      }),
      ...edgeErrorSchemas,
      401: z.object({
        error: z.string().optional(),
        message: z.string().nullable().optional(),
        status: z.number().optional(),
      }),
      500: z.object({
        error: z.string(),
        message: z.string().nullable().optional(),
      }),
      502: upstreamErrorSchema,
    },
  },
};

function isAdminApiToken(value: string) {
  const token = value.trim();
  return (
    token.startsWith("shpat_") ||
    token.startsWith("shpua_") ||
    token.length >= 20
  );
}

export async function shopifyConnectCustomAppHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const shop = normalizeShopHandleOrDomain(body.shop || body.shop_domain || "");
  const accessToken = (
    body.access_token ||
    body.admin_api_access_token ||
    ""
  ).trim();
  const clientId = (body.client_id || body.clientId || "").trim();
  const clientSecret = (body.client_secret || body.clientSecret || "").trim();

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!shop) {
    return reply.status(400).send({ error: "missing_shopify_shop_domain" });
  }
  if (!accessToken && (!clientId || !clientSecret)) {
    return reply.status(400).send({ error: "missing_shopify_credentials" });
  }
  if (accessToken && !isAdminApiToken(accessToken)) {
    return reply
      .status(400)
      .send({ error: "invalid_shopify_admin_api_token" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  let tokenForValidation = accessToken;
  let tokenData: ShopifyTokenResponse | null = null;
  const connectionMode = accessToken
    ? "custom_app_manual"
    : "custom_app_client_credentials";

  if (!tokenForValidation) {
    const tokenResult = await requestShopifyAccessToken(shop, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });

    if (!tokenResult.ok || !tokenResult.payload.access_token) {
      return reply
        .status(
          tokenResult.status === 401 || tokenResult.status === 403 ? 401 : 502,
        )
        .send({
          error: "shopify_client_credentials_token_failed",
          message:
            tokenResult.payload.error_description ||
            tokenResult.payload.error ||
            null,
          status: tokenResult.status,
        });
    }

    tokenData = tokenResult.payload;
    tokenForValidation = tokenResult.payload.access_token;
  }

  const validation = await fetchShopifyShop(shop, tokenForValidation);
  const shopResponse = validation.payload as ShopifyShopResponse;
  if (!validation.ok || shopResponse.errors || !shopResponse.shop) {
    return reply
      .status(
        validation.status === 401 || validation.status === 403 ? 401 : 502,
      )
      .send({
        error: "shopify_custom_app_validation_failed",
        message:
          typeof shopResponse.errors === "string"
            ? shopResponse.errors
            : `shopify_custom_app_validation_failed:${validation.status}`,
        status: validation.status,
      });
  }

  const shopInfo = shopResponse.shop ?? {};
  const now = new Date();
  const shopDomain =
    normalizeShopHandleOrDomain(shopInfo.myshopify_domain || shop) || shop;
  const storeUrl = shopInfo.domain
    ? `https://${shopInfo.domain}`
    : `https://${shopDomain}`;

  const integrationData = {
    connected_at: now,
    credentials: {},
    external_store_id: shopDomain,
    settings: {
      connected_via: connectionMode,
      custom_app_manual_connected_at:
        connectionMode === "custom_app_manual" ? now.toISOString() : null,
      custom_app_client_credentials_connected_at:
        connectionMode === "custom_app_client_credentials"
          ? now.toISOString()
          : null,
      shop_domain: shopDomain,
      shopify_shop_id: shopInfo.id ? String(shopInfo.id) : null,
    },
    status: "active",
  };

  let integrationId = "";
  try {
    const integration = await prisma.integration.upsert({
      where: {
        store_id_provider: { store_id: storeId, provider: "shopify" },
      },
      create: { ...integrationData, provider: "shopify", store_id: storeId },
      update: integrationData,
      select: { id: true },
    });
    integrationId = integration.id;
  } catch (error) {
    return reply.status(500).send({
      error: "luup_integration_save_failed",
      message: error instanceof Error ? error.message : null,
    });
  }

  const secretData = {
    access_token: tokenForValidation,
    external_store_id: shopDomain,
    metadata: {
      access_token_expires_at: shopifyTokenExpiresAt(tokenData?.expires_in),
      client_id: clientId || null,
      client_secret: clientSecret || null,
      connected_via: connectionMode,
      non_expiring_admin_token: connectionMode === "custom_app_manual",
      shop_domain: shopDomain,
      source: connectionMode,
    },
    scope: tokenData?.scope || "read_products,read_inventory,read_locations",
    token_type:
      connectionMode === "custom_app_manual"
        ? "admin_api_access_token"
        : "bearer",
  };

  try {
    await prisma.integrationSecret.upsert({
      where: { integration_id: integrationId },
      create: {
        ...secretData,
        integration_id: integrationId,
        provider: "shopify",
      },
      update: secretData,
    });
  } catch (error) {
    return reply.status(500).send({
      error: "luup_integration_secret_save_failed",
      message: error instanceof Error ? error.message : null,
    });
  }

  await prisma.store.update({
    where: { id: storeId },
    data: { platform: "shopify", url: storeUrl },
  });

  return reply.status(200).send({
    integration_id: integrationId,
    ok: true,
    shop_domain: shopDomain,
    shop_name: shopInfo.name || shopDomain,
  });
}
