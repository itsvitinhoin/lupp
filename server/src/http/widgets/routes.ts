import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listWidgetsHandler, ListWidgetsSchema } from "./list-widgets";
import { updateWidgetHandler, UpdateWidgetSchema } from "./update-widget";
import { ensureFloatingHandler, EnsureFloatingSchema } from "./ensure-floating";

// Admin widget config CRUD. The public storefront surface (bootstrap, events,
// likes) lives in src/http/widget/.
export async function WidgetsAdminRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/widgets",
    { schema: ListWidgetsSchema.schema, preHandler: [verifyJwt] },
    listWidgetsHandler,
  );
  app.post(
    "/api/widgets/floating/ensure",
    { schema: EnsureFloatingSchema.schema, preHandler: [verifyJwt] },
    ensureFloatingHandler,
  );
  app.patch(
    "/api/widgets/:widgetId",
    { schema: UpdateWidgetSchema.schema, preHandler: [verifyJwt] },
    updateWidgetHandler,
  );
}
