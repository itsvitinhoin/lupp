import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { widgetBootstrapHandler, WidgetBootstrapSchema } from "./bootstrap";
import { trackWidgetEventHandler, TrackWidgetEventSchema } from "./track-event";
import { likeVideoHandler, LikeVideoSchema } from "./like-video";

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: "1m" } });

// Public routes (no preHandler): the storefront embed script calls them
// anonymously, exactly like the original edge function.
export async function WidgetRoutes(app: FastifyTypedInstance) {
  // Public + anonymous: both need per-IP ceilings. Bootstrap answers from
  // cache-friendly reads (generous limit); events INSERT into the
  // highest-growth table on every beacon, so it gets a tighter one.
  app.get(
    "/api/widget/bootstrap",
    { schema: WidgetBootstrapSchema.schema, config: perMinute(120) },
    widgetBootstrapHandler,
  );
  app.post(
    "/api/widget/events",
    { schema: TrackWidgetEventSchema.schema, config: perMinute(60) },
    trackWidgetEventHandler,
  );
  app.post(
    "/api/widget/likes",
    { schema: LikeVideoSchema.schema, config: perMinute(30) },
    likeVideoHandler,
  );
}
