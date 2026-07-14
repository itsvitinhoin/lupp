import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { consumeAuthToken } from "@/lib/auth-tokens";

const QuerySchema = z.object({
  token: z.string().min(1).describe("Single-use confirmation token from the emailed link."),
});

export const ConfirmEmailSchema = {
  schema: {
    summary: "Confirm email",
    description:
      "Target of the emailed confirmation link — a human clicks this, so it answers with a " +
      "302 to the SPA instead of JSON: `/login?confirmed=1` on success, `/login?confirm_error=1` " +
      "when the token is unknown, expired, or already used.",
    tags: ["auth"],
    operationId: "confirmEmail",
    querystring: QuerySchema,
    // 302 intentionally undeclared: redirects carry no JSON body to serialize.
    response: {
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function confirmEmailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token } = QuerySchema.parse(request.query);

  const authToken = await consumeAuthToken(token, "email_confirmation");
  if (!authToken) {
    return reply.redirect(`${env.LUPP_APP_URL}/login?confirm_error=1`, 302);
  }

  await prisma.user.updateMany({
    where: { id: authToken.user_id, email_confirmed_at: null },
    data: { email_confirmed_at: new Date() },
  });

  return reply.redirect(`${env.LUPP_APP_URL}/login?confirmed=1`, 302);
}
