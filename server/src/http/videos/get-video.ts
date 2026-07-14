import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeVideo, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { VideoRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ videoId: z.string().min(1) });

export const GetVideoSchema = {
  schema: {
    summary: "Get video",
    description: "A single video (with nested products) for duplication/editing.",
    tags: ["videos"],
    operationId: "getVideo",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ video: VideoRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function getVideoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { videoId } = ParamsSchema.parse(request.params);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: VIDEO_PRODUCTS_INCLUDE,
  });
  if (!video || video.status === "deleted") {
    return reply.status(404).send({ error: "video_not_found" });
  }

  const member = await findStoreMembership(request.user.sub, video.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  return reply.status(200).send({ video: serializeVideo(video as unknown as VideoRow) });
}
