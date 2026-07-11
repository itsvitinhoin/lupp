import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { normalizeShopDomain, resolveShopifyAppConfig } from "@/lib/shopify";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/shopify-app-config. Public: the embedded app
// asks which client_id (api key) to boot App Bridge with for a given shop.
const BodySchema = z.object({
  shop: z
    .string()
    .optional()
    .describe("Shop domain (any format; normalized to *.myshopify.com)."),
});

export const ShopifyAppConfigSchema = {
  schema: {
    summary: "Resolve Shopify app config",
    description:
      "Returns the Shopify app api_key (client_id) to use for a shop — a custom app from " +
      "SHOPIFY_CUSTOM_APPS_JSON when the shop matches one, the default app otherwise. Public " +
      "(the embedded SPA calls it before any session exists).",
    tags: ["shopify"],
    operationId: "shopifyAppConfig",
    body: BodySchema,
    response: {
      200: z.object({ api_key: z.string(), shop: z.string() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function shopifyAppConfigHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const shop = normalizeShopDomain(body.shop);
  const config = resolveShopifyAppConfig({ shop });
  if (!config?.apiKey) {
    return reply.status(500).send({ error: "missing_shopify_app_config" });
  }

  return reply.status(200).send({ api_key: config.apiKey, shop });
}
