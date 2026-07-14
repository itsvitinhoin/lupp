import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeVideo, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { VideoRowSchema } from "@/schemas/rows";
import { VideoColumnsSchema } from "./video-columns";

const ParamsSchema = z.object({ videoId: z.string().min(1) });

const BodySchema = VideoColumnsSchema.extend({
  product_ids: z
    .array(z.string().min(1))
    .optional()
    .describe("When present, replaces every product link (first id is primary)."),
});

export const UpdateVideoSchema = {
  schema: {
    summary: "Update video",
    description:
      "Partial update of a video's columns; product_ids, when present, " +
      "replaces the product links transactionally.",
    tags: ["videos"],
    operationId: "updateVideo",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    body: BodySchema,
    response: {
      200: z.object({ video: VideoRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function updateVideoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { videoId } = ParamsSchema.parse(request.params);
  const { product_ids, ...columns } = BodySchema.parse(request.body ?? {});

  const existing = await prisma.video.findUnique({
    where: { id: videoId },
    select: { store_id: true },
  });
  if (!existing) return reply.status(404).send({ error: "video_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const productIds =
    product_ids === undefined
      ? undefined
      : Array.from(new Set(product_ids.map((id) => id.trim()).filter(Boolean)));

  if (productIds?.length) {
    const owned = await prisma.product.count({
      where: { id: { in: productIds }, store_id: existing.store_id },
    });
    if (owned !== productIds.length) {
      return reply.status(400).send({ error: "invalid_product_ids" });
    }
  }

  const video = await prisma.$transaction(async (tx) => {
    if (productIds !== undefined) {
      await tx.videoProduct.deleteMany({ where: { video_id: videoId } });
      if (productIds.length) {
        await tx.videoProduct.createMany({
          data: productIds.map((product_id, index) => ({
            video_id: videoId,
            product_id,
            is_primary: index === 0,
          })),
        });
      }
    }
    await tx.video.update({ where: { id: videoId }, data: columns });
    return tx.video.findUniqueOrThrow({
      where: { id: videoId },
      include: VIDEO_PRODUCTS_INCLUDE,
    });
  });

  return reply.status(200).send({ video: serializeVideo(video as unknown as VideoRow) });
}
