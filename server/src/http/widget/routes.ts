import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { widgetBootstrapHandler, WidgetBootstrapSchema } from "./bootstrap";
import { trackWidgetEventHandler, TrackWidgetEventSchema } from "./track-event";
import { likeVideoHandler, LikeVideoSchema } from "./like-video";

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: "1m" } });

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
  app.post(
    "/api/widget/likes",
    { schema: LikeVideoSchema.schema, config: perMinute(30) },
    likeVideoHandler,
  );
}
