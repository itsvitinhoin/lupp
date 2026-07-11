import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import {
  buildShopifyAuthorizeUrl,
  normalizeShopDomain,
  resolveShopifyAppConfig,
  shopifyAppUrl,
  shopifyRedirectUri,
  signShopifyState,
} from "@/lib/shopify";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/shopify-oauth-start. Field checks stay in the
// handler so the machine-readable error codes the SPA switches on are kept.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store initiating the OAuth flow."),
  shop: z
    .string()
    .optional()
    .describe("Shop domain; falls back to the store's url."),
  return_to: z
    .string()
    .optional()
    .describe("SPA URL to land on after the callback."),
});

export const ShopifyOauthStartSchema = {
  schema: {
    summary: "Start Shopify OAuth",
    description:
      "Builds the Shopify authorize URL for a store: signs an HMAC state (store, user, shop, " +
      "return_to) with SHOPIFY_STATE_SECRET and returns the admin/oauth/authorize URL the SPA " +
      "redirects the merchant to.",
    tags: ["shopify"],
    operationId: "shopifyOauthStart",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ authorize_url: z.string(), shop: z.string() }),
      ...edgeErrorSchemas,
    },
  },
};

function inferShopDomain(input: unknown, fallbackUrl: unknown) {
  const fromInput = normalizeShopDomain(input);
  if (fromInput) return fromInput;
  return normalizeShopDomain(fallbackUrl);
}

export async function shopifyOauthStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const stateSecret = env.SHOPIFY_STATE_SECRET;
  if (!stateSecret) {
    return reply.status(500).send({ error: "missing_shopify_server_config" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const returnTo = (
    body.return_to || `${shopifyAppUrl()}/app/integrations`
  ).trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, url: true },
  });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const shop = inferShopDomain(body.shop, store.url);
  if (!shop) {
    return reply.status(400).send({ error: "missing_shopify_shop_domain" });
  }

  const appConfig = resolveShopifyAppConfig({ shop });
  if (!appConfig) {
    return reply.status(500).send({ error: "missing_shopify_app_config" });
  }

  const state = signShopifyState(
    {
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo,
      shop,
      store_id: storeId,
      user_id: request.user.sub,
    },
    stateSecret,
  );

  const authorizeUrl = buildShopifyAuthorizeUrl({
    apiKey: appConfig.apiKey,
    redirectUri: shopifyRedirectUri(),
    scopes: appConfig.scopes,
    shop,
    state,
  });

  return reply.status(200).send({ authorize_url: authorizeUrl, shop });
}
