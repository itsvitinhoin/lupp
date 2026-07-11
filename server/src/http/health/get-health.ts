import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { errorSchemas } from "@/schemas/http-errors";

export const GetHealthSchema = {
  schema: {
    tags: ["health"],
    description: "Liveness/readiness probe. Verifies the database connection.",
    response: {
      200: z.object({
        status: z.literal("ok"),
        database: z.literal("ok"),
      }),
      ...errorSchemas,
    },
  },
};

export async function getHealthHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  await prisma.$queryRaw`SELECT 1`;

  return reply.status(200).send({ status: "ok", database: "ok" });
}
