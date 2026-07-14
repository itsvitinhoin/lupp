import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { getFeedHandler, GetFeedSchema } from "./get-feed";

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: "1m" } });

export async function FeedRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/feed",
    { schema: GetFeedSchema.schema, config: perMinute(60) },
    getFeedHandler,
  );
}
