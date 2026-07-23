import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { canOperateStore } from "@/lib/store-membership";
import { serializeVideo, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { VideoRowSchema } from "@/schemas/rows";
import { Prisma } from "../../../generated/prisma/client";

const QuerySchema = z.object({
  store_id: z.string().min(1),
  search: z.string().optional().describe("Case-insensitive title filter."),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export const ListVideosSchema = {
  schema: {
    summary: "List videos",
    description:
      "Videos of a store the user is a member of (deleted excluded), with " +
      "nested video_products → products → product_variants, ordered by " +
      "sort_order then newest.",
    tags: ["videos"],
    operationId: "listVideos",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ videos: z.array(VideoRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listVideosHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const allowed = await canOperateStore(request.user.sub, query.store_id);
  if (!allowed) return reply.status(403).send({ error: "store_access_denied" });

  const where: Prisma.VideoWhereInput = {
    store_id: query.store_id,
    status: { not: "deleted" },
  };
  if (query.search) where.title = { contains: query.search, mode: "insensitive" };
  if (query.status) where.status = query.status;

  const videos = await prisma.video.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
    include: VIDEO_PRODUCTS_INCLUDE,
  });

  return reply
    .status(200)
    .send({ videos: videos.map((video) => serializeVideo(video as unknown as VideoRow)) });
}
