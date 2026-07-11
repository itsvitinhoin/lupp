import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { widgetBootstrapHandler, WidgetBootstrapSchema } from "./bootstrap";
import { trackWidgetEventHandler, TrackWidgetEventSchema } from "./track-event";

// Public routes (no preHandler): the storefront embed script calls them
// anonymously, exactly like the original edge function.
export async function WidgetRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/widget/bootstrap",
    { schema: WidgetBootstrapSchema.schema },
    widgetBootstrapHandler,
  );
  app.post(
    "/api/widget/events",
    { schema: TrackWidgetEventSchema.schema },
    trackWidgetEventHandler,
  );
}
