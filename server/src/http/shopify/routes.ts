import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { shopifyAppConfigHandler, ShopifyAppConfigSchema } from "./app-config";
import { shopifyOauthStartHandler, ShopifyOauthStartSchema } from "./oauth-start";
import {
  shopifyOauthCallbackHandler,
  ShopifyOauthCallbackSchema,
} from "./oauth-callback";
import {
  shopifyEmbeddedSessionHandler,
  ShopifyEmbeddedSessionSchema,
} from "./embedded-session";
import {
  shopifySessionTokenPingHandler,
  ShopifySessionTokenPingSchema,
} from "./session-token-ping";
import {
  shopifyConnectCustomAppHandler,
  ShopifyConnectCustomAppSchema,
} from "./connect-custom-app";
import {
  shopifySyncProductsHandler,
  ShopifySyncProductsSchema,
} from "./sync-products";
import {
  shopifyComplianceWebhooksHandler,
  ShopifyComplianceWebhooksSchema,
} from "./compliance-webhooks";

declare module "fastify" {
  interface FastifyRequest {
    /** Raw body preserved for Shopify webhook HMAC verification. */
    rawBody?: string;
  }
}

// The spec files register this plugin directly (src/routes.ts aggregation is
// wired by the orchestrator); the guard makes a second registration a no-op
// instead of a duplicated-route error.
let registered = false;

export async function ShopifyRoutes(app: FastifyTypedInstance) {
  if (registered) return;
  registered = true;

  app.post(
    "/api/integrations/shopify/app-config",
    { schema: ShopifyAppConfigSchema.schema },
    shopifyAppConfigHandler,
  );

  app.post(
    "/api/integrations/shopify/oauth/start",
    { schema: ShopifyOauthStartSchema.schema, preHandler: [verifyJwt] },
    shopifyOauthStartHandler,
  );

  app.get(
    "/api/integrations/shopify/oauth/callback",
    { schema: ShopifyOauthCallbackSchema.schema },
    shopifyOauthCallbackHandler,
  );

  app.post(
    "/api/integrations/shopify/embedded-session",
    { schema: ShopifyEmbeddedSessionSchema.schema },
    shopifyEmbeddedSessionHandler,
  );

  app.post(
    "/api/integrations/shopify/session-token-ping",
    { schema: ShopifySessionTokenPingSchema.schema },
    shopifySessionTokenPingHandler,
  );

  app.post(
    "/api/integrations/shopify/connect-custom-app",
    { schema: ShopifyConnectCustomAppSchema.schema, preHandler: [verifyJwt] },
    shopifyConnectCustomAppHandler,
  );

  app.post(
    "/api/integrations/shopify/sync-products",
    { schema: ShopifySyncProductsSchema.schema, preHandler: [verifyJwt] },
    shopifySyncProductsHandler,
  );

  // Shopify signs compliance webhooks with an HMAC over the RAW request body,
  // so this scoped (encapsulated) content parser keeps the exact bytes around.
  // JSON parsing is deferred to the handler: the original only rejects a bad
  // payload (400 invalid_json) AFTER the signature check.
  app.register(async (webhooks: FastifyTypedInstance) => {
    webhooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (webhookRequest, body, done) => {
        webhookRequest.rawBody = body.toString("utf8");
        done(null, {});
      },
    );

    webhooks.post(
      "/api/webhooks/shopify-compliance",
      { schema: ShopifyComplianceWebhooksSchema.schema },
      shopifyComplianceWebhooksHandler,
    );

    webhooks.post(
      "/api/webhooks/shopify-compliance/:event",
      { schema: ShopifyComplianceWebhooksSchema.schema },
      shopifyComplianceWebhooksHandler,
    );
  });
}
