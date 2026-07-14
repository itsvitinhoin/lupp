import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeProduct } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { ProductRowSchema } from "@/schemas/rows";
import { Prisma } from "../../../generated/prisma/client";

const QuerySchema = z.object({
  store_id: z.string().min(1).describe("Store whose products are listed."),
  search: z.string().optional().describe("Case-insensitive name filter."),
  status: z.enum(["active", "draft", "archived"]).optional(),
});

export const ListProductsSchema = {
  schema: {
    summary: "List products",
    description: "Products of a store the user is a member of, newest first.",
    tags: ["products"],
    operationId: "listProducts",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ products: z.array(ProductRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, query.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const where: Prisma.ProductWhereInput = { store_id: query.store_id };
  if (query.search) where.name = { contains: query.search, mode: "insensitive" };
  if (query.status) where.status = query.status;

  const products = await prisma.product.findMany({
    where,
    orderBy: { created_at: "desc" },
  });

  return reply.status(200).send({ products: products.map(serializeProduct) });
}
