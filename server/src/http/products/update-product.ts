import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeProduct } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { ProductRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ productId: z.string().min(1) });

const BodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  price: z.number().nullish(),
  compare_at_price: z.number().nullish(),
  currency: z.string().optional(),
  image_url: z.string().nullish(),
  product_url: z.string().nullish(),
  platform: z.string().nullish(),
  external_id: z.string().nullish(),
  status: z.enum(["active", "draft", "archived"]).optional(),
});

export const UpdateProductSchema = {
  schema: {
    summary: "Update product",
    description: "Partial update of a product on a store the user is a member of.",
    tags: ["products"],
    operationId: "updateProduct",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    body: BodySchema,
    response: {
      200: z.object({ product: ProductRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function updateProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const { productId } = ParamsSchema.parse(request.params);
  const body = BodySchema.parse(request.body ?? {});

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { store_id: true },
  });
  if (!existing) return reply.status(404).send({ error: "product_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const product = await prisma.product.update({ where: { id: productId }, data: body });
  return reply.status(200).send({ product: serializeProduct(product) });
}
