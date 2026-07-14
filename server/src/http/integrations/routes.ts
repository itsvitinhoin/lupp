import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listIntegrationsHandler, ListIntegrationsSchema } from "./list-integrations";
import { upsertTrackingHandler, UpsertTrackingSchema } from "./upsert-tracking";

// Generic integration reads/settings. Provider OAuth/sync flows live in their
// own domains (src/http/nuvemshop, shopify, upzero) under /api/integrations/<provider>/.
export async function IntegrationRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/integrations",
    { schema: ListIntegrationsSchema.schema, preHandler: [verifyJwt] },
    listIntegrationsHandler,
  );
  app.put(
    "/api/integrations/tracking",
    { schema: UpsertTrackingSchema.schema, preHandler: [verifyJwt] },
    upsertTrackingHandler,
  );
}
