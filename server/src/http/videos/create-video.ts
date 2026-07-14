import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeVideo, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { VideoRowSchema } from "@/schemas/rows";
import { VideoColumnsSchema } from "./video-columns";

const BodySchema = VideoColumnsSchema.extend({
  store_id: z.string().min(1),
  title: z.string().min(1),
  product_ids: z.array(z.string().min(1)).optional(),
});

export const CreateVideoSchema = {
  schema: {
    summary: "Create video",
    description:
      "Creates the videos row and its product links (first id is primary) in " +
      "one transaction. Product ids must belong to the same store, else 400 " +
      "invalid_product_ids.",
    tags: ["videos"],
    operationId: "createVideo",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      201: z.object({ video: VideoRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function createVideoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id, product_ids, ...columns } = BodySchema.parse(request.body);

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const productIds = Array.from(new Set((product_ids ?? []).map((id) => id.trim()).filter(Boolean)));
  if (productIds.length) {
    const owned = await prisma.product.count({
      where: { id: { in: productIds }, store_id },
    });
    if (owned !== productIds.length) {
      return reply.status(400).send({ error: "invalid_product_ids" });
    }
  }

  const video = await prisma.$transaction(async (tx) => {
    const created = await tx.video.create({ data: { store_id, ...columns } });
    if (productIds.length) {
      await tx.videoProduct.createMany({
        data: productIds.map((product_id, index) => ({
          video_id: created.id,
          product_id,
          is_primary: index === 0,
        })),
      });
    }
    return tx.video.findUniqueOrThrow({
      where: { id: created.id },
      include: VIDEO_PRODUCTS_INCLUDE,
    });
  });

  return reply.status(201).send({ video: serializeVideo(video as unknown as VideoRow) });
}
