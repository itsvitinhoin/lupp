import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { StoreRowSchema } from "@/schemas/rows";

export const ListStoresSchema = {
  schema: {
    summary: "List user stores",
    description:
      "Stores the authenticated user is a member of, oldest first. (The " +
      "Supabase version returned every RLS-visible store; membership is now " +
      "the explicit filter.)",
    tags: ["stores"],
    operationId: "listStores",
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({ stores: z.array(StoreRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listStoresHandler(request: FastifyRequest, reply: FastifyReply) {
  const stores = await prisma.store.findMany({
    where: { members: { some: { user_id: request.user.sub } } },
    orderBy: { created_at: "asc" },
  });

  return reply.status(200).send({ stores });
}
