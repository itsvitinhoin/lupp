import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeProduct } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { ProductRowSchema } from "@/schemas/rows";
import { Prisma } from "../../../generated/prisma/client";

const BodySchema = z.object({
  store_id: z.string().min(1),
  name: z.string().min(1),
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

export const CreateProductSchema = {
  schema: {
    summary: "Create product",
    description:
      "Creates a product for a store the user is a member of. A duplicate " +
      "(store, platform, external_id) returns 409 product_already_exists.",
    tags: ["products"],
    operationId: "createProduct",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      201: z.object({ product: ProductRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function createProductHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);

  const member = await findStoreMembership(request.user.sub, body.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  try {
    const product = await prisma.product.create({ data: body });
    return reply.status(201).send({ product: serializeProduct(product) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.status(409).send({ error: "product_already_exists" });
    }
    throw error;
  }
}
