import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const QuerySchema = z.object({ store_id: z.string().min(1) });

export const DashboardCountsSchema = {
  schema: {
    summary: "Dashboard head counts",
    description:
      "The three cheap counters the dashboard shows: active videos, total " +
      "likes and pending comments.",
    tags: ["analytics"],
    operationId: "getDashboardCounts",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({
        active_videos: z.number(),
        total_likes: z.number(),
        pending_comments: z.number(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function dashboardCountsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id } = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const [active_videos, total_likes, pending_comments] = await Promise.all([
    prisma.video.count({ where: { store_id, status: "active" } }),
    prisma.videoLike.count({ where: { store_id } }),
    prisma.comment.count({ where: { store_id, status: "pending" } }),
  ]);

  return reply.status(200).send({ active_videos, total_likes, pending_comments });
}
