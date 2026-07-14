import { z } from "zod";
import bcrypt from "bcryptjs";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { consumeAuthToken } from "@/lib/auth-tokens";

const BodySchema = z.object({
  token: z.string().min(1).describe("Single-use reset token from the emailed link."),
  password: z.string().min(6).describe("New account password, minimum 6 characters."),
});

export const ResetPasswordConfirmSchema = {
  schema: {
    summary: "Confirm password reset",
    description:
      "Sets a new password from a valid reset token. A bad/expired/used token is a 400 " +
      "(deliberately not 401 — the SPA treats 401 as session expiry). Completing a reset " +
      "also confirms the email: following the emailed link proves control of the inbox.",
    tags: ["auth"],
    operationId: "resetPasswordConfirm",
    body: BodySchema,
    response: {
      200: z.object({ reset: z.literal(true) }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function resetPasswordConfirmHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token, password } = BodySchema.parse(request.body);

  const authToken = await consumeAuthToken(token, "password_reset");
  if (!authToken) {
    throw new Error("Invalid or expired password reset token.");
  }

  const password_hash = await bcrypt.hash(password, 6);
  await prisma.user.updateMany({
    where: { id: authToken.user_id },
    data: { password_hash },
  });
  await prisma.user.updateMany({
    where: { id: authToken.user_id, email_confirmed_at: null },
    data: { email_confirmed_at: new Date() },
  });

  return reply.status(200).send({ reset: true });
}
