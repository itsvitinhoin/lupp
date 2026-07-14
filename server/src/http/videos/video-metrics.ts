import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { findStoreMembership } from "@/lib/store-membership";
import { emptyVideoMetrics, getVideoMetrics } from "@/lib/video-metrics";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const MAX_VIDEO_IDS = 200;

const QuerySchema = z.object({
  store_id: z.string().min(1),
  video_ids: z.string().min(1).describe("Comma-separated videos.id list (max 200)."),
});

const MetricsSchema = z.object({
  video_id: z.string(),
  views: z.number(),
  clicks: z.number(),
  likes: z.number(),
  comments: z.number(),
  revenue: z.number(),
});

export const VideoMetricsSchema = {
  schema: {
    summary: "Per-video metrics",
    description:
      "Engagement counters per video (views/clicks/likes/comments/revenue), " +
      "aggregated server-side from analytics events, likes and comments — " +
      "replaces the SPA's three-table scan.",
    tags: ["videos"],
    operationId: "getVideoMetrics",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ metrics: z.array(MetricsSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function videoMetricsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, query.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const videoIds = Array.from(
    new Set(query.video_ids.split(",").map((id) => id.trim()).filter(Boolean)),
  ).slice(0, MAX_VIDEO_IDS);

  const metricsByVideo = await getVideoMetrics(query.store_id, videoIds);

  return reply.status(200).send({
    metrics: videoIds.map((video_id) => ({
      video_id,
      ...(metricsByVideo.get(video_id) ?? emptyVideoMetrics()),
    })),
  });
}
