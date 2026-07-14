import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { StoreRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ storeId: z.string().min(1) });

export const GetStoreSchema = {
  schema: {
    summary: "Get store",
    description: "A single store the user is a member of.",
    tags: ["stores"],
    operationId: "getStore",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ store: StoreRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function getStoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const { storeId } = ParamsSchema.parse(request.params);

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  return reply.status(200).send({ store });
}
