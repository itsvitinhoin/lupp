import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const BodySchema = z.object({
  store_id: z.string().min(1),
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        is_featured: z.boolean(),
        sort_order: z.number().int(),
      }),
    )
    .min(1)
    .max(200),
});

export const VideoOrderingSchema = {
  schema: {
    summary: "Reorder videos",
    description:
      "Bulk sort_order/is_featured update in one transaction — replaces the " +
      "SPA's per-video request fanout. Updates are scoped to the store; ids " +
      "from other stores are silently skipped.",
    tags: ["videos"],
    operationId: "updateVideoOrdering",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ ok: z.literal(true) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function videoOrderingHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);

  const member = await findStoreMembership(request.user.sub, body.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  await prisma.$transaction(
    body.updates.map((update) =>
      prisma.video.updateMany({
        where: { id: update.id, store_id: body.store_id },
        data: { is_featured: update.is_featured, sort_order: update.sort_order },
      }),
    ),
  );

  return reply.status(200).send({ ok: true });
}
