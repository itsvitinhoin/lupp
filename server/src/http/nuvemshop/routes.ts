import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import {
  nuvemshopOauthStartHandler,
  NuvemshopOauthStartSchema,
} from "./oauth-start";
import {
  nuvemshopOauthCallbackHandler,
  NuvemshopOauthCallbackSchema,
} from "./oauth-callback";
import {
  nuvemshopInstallScriptHandler,
  NuvemshopInstallScriptSchema,
} from "./install-script";
import {
  nuvemshopSyncProductsHandler,
  NuvemshopSyncProductsSchema,
} from "./sync-products";
import {
  nuvemshopLgpdWebhookHandler,
  NuvemshopLgpdWebhookSchema,
} from "./lgpd-webhooks";

export async function NuvemshopRoutes(app: FastifyTypedInstance) {
  app.post(
    "/api/integrations/nuvemshop/oauth/start",
    { schema: NuvemshopOauthStartSchema.schema, preHandler: [verifyJwt] },
    nuvemshopOauthStartHandler,
  );

  // Public: Nuvemshop redirects the merchant's browser here after authorize.
  app.get(
    "/api/integrations/nuvemshop/oauth/callback",
    { schema: NuvemshopOauthCallbackSchema.schema },
    nuvemshopOauthCallbackHandler,
  );

  app.post(
    "/api/integrations/nuvemshop/install-script",
    { schema: NuvemshopInstallScriptSchema.schema, preHandler: [verifyJwt] },
    nuvemshopInstallScriptHandler,
  );

  app.post(
    "/api/integrations/nuvemshop/sync-products",
    { schema: NuvemshopSyncProductsSchema.schema, preHandler: [verifyJwt] },
    nuvemshopSyncProductsHandler,
  );

  // Public LGPD webhooks. Nuvemshop signs the RAW body (HMAC-SHA256), so this
  // encapsulated scope replaces the JSON parser with one that hands the
  // handler the original string — parsing happens after signature check.
  app.register(async (webhooks) => {
    const keepRawBody = (
      _request: unknown,
      body: string,
      done: (error: Error | null, result?: unknown) => void,
    ) => done(null, body);
    webhooks.addContentTypeParser("application/json", { parseAs: "string" }, keepRawBody);
    webhooks.addContentTypeParser("*", { parseAs: "string" }, keepRawBody);

    webhooks.post(
      "/api/webhooks/nuvemshop-lgpd/:event",
      { schema: NuvemshopLgpdWebhookSchema.schema },
      nuvemshopLgpdWebhookHandler,
    );
  });
}
