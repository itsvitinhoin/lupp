import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { upzeroConnectHandler, UpzeroConnectSchema } from "./connect";
import {
  upzeroSyncProductsHandler,
  UpzeroSyncProductsSchema,
} from "./sync-products";
import {
  upzeroStorefrontProxyHandler,
  UpzeroStorefrontProxySchema,
} from "./storefront-proxy";

export async function UpzeroRoutes(app: FastifyTypedInstance) {
  app.post(
    "/api/integrations/upzero/connect",
    { schema: UpzeroConnectSchema.schema, preHandler: [verifyJwt] },
    upzeroConnectHandler,
  );

  app.post(
    "/api/integrations/upzero/sync-products",
    { schema: UpzeroSyncProductsSchema.schema, preHandler: [verifyJwt] },
    upzeroSyncProductsHandler,
  );

  // Public: called by the widget from the merchant's storefront (no JWT).
  // Rate-limited — every action fans out to an outbound upstream fetch.
  app.post(
    "/api/widget/upzero-proxy",
    {
      schema: UpzeroStorefrontProxySchema.schema,
      config: { rateLimit: { max: 30, timeWindow: "1m" } },
    },
    upzeroStorefrontProxyHandler,
  );
}
