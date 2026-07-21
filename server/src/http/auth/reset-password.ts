import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendPasswordReset } from "@/lib/mailer";

const BodySchema = z.object({
  email: z.email().describe("Email to send the password reset link to."),
});

export const ResetPasswordSchema = {
  schema: {
    summary: "Request password reset",
    description:
      "Emails a 1-hour reset link when the email belongs to an account. Always answers 200 " +
      "so responses don't reveal whether an email is registered. Also the way into password " +
      "sign-in for accounts provisioned via store OAuth (they have no usable password).",
    tags: ["auth"],
    operationId: "resetPassword",
    body: BodySchema,
    response: {
      200: z.object({ sent: z.literal(true) }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function resetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (user) {
    const token = await issueAuthToken(user.id, "password_reset");
    await sendPasswordReset({
      to: email,
      name: user.name,
      resetUrl: `${env.LUPP_APP_URL}/login?reset=1&token=${token}`,
    });
  }

  return reply.status(200).send({ sent: true });
}
