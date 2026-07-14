import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listAnalyticsEventsHandler, ListAnalyticsEventsSchema } from "./list-events";
import { dashboardCountsHandler, DashboardCountsSchema } from "./dashboard-counts";

export async function AnalyticsRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/analytics/events",
    { schema: ListAnalyticsEventsSchema.schema, preHandler: [verifyJwt] },
    listAnalyticsEventsHandler,
  );
  app.get(
    "/api/analytics/dashboard-counts",
    { schema: DashboardCountsSchema.schema, preHandler: [verifyJwt] },
    dashboardCountsHandler,
  );
}
