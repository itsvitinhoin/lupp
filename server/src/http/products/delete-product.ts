import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const ParamsSchema = z.object({ productId: z.string().min(1) });

export const DeleteProductSchema = {
  schema: {
    summary: "Delete product",
    description:
      "Hard-deletes a product (variants and video links cascade) on a store " +
      "the user is a member of.",
    tags: ["products"],
    operationId: "deleteProduct",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ ok: z.literal(true) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function deleteProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { productId } = ParamsSchema.parse(request.params);

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { store_id: true },
  });
  if (!existing) return reply.status(404).send({ error: "product_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  await prisma.product.delete({ where: { id: productId } });
  return reply.status(200).send({ ok: true });
}
