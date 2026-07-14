import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/errors";
import { errorSchemas } from "@/schemas/http-errors";
import { PublicUserSchema, publicUserSelect, toPublicUser } from "./public-user";

export const MeSchema = {
  schema: {
    summary: "Get current user",
    description:
      "Returns the account behind the bearer access token. Backs both getUser() and " +
      "getSession() in the SPA auth service.",
    tags: ["auth"],
    operationId: "getCurrentUser",
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({ user: PublicUserSchema }),
      ...errorSchemas,
    },
  },
};

export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: publicUserSelect,
  });
  if (!user) throw new ResourceNotFoundError("User");

  return reply.status(200).send({ user: toPublicUser(user) });
}
