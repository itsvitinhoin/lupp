import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";

export const SignOutSchema = {
  schema: {
    summary: "Sign out",
    description:
      "Clears the `refreshToken` cookie. Deliberately unauthenticated and idempotent so the " +
      "SPA's signOut can never fail; access tokens simply expire (15m).",
    tags: ["auth"],
    operationId: "signOut",
    response: {
      204: z.null().describe("Session cookie cleared."),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function signOutHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.clearCookie("refreshToken", { path: "/" }).status(204).send();
}
