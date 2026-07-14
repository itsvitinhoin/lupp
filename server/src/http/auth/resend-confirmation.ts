import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendEmailConfirmation } from "@/lib/mailer";

const BodySchema = z.object({
  email: z.email().describe("Email to resend the confirmation link to."),
});

export const ResendConfirmationSchema = {
  schema: {
    summary: "Resend confirmation email",
    description:
      "Issues a fresh confirmation link (invalidating previous ones) when the email belongs " +
      "to an unconfirmed account. Always answers 200 so responses don't reveal whether an " +
      "email is registered.",
    tags: ["auth"],
    operationId: "resendConfirmation",
    body: BodySchema,
    response: {
      200: z.object({ sent: z.literal(true) }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function resendConfirmationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.email_confirmed_at) {
    const token = await issueAuthToken(user.id, "email_confirmation");
    await sendEmailConfirmation({
      to: email,
      name: user.name,
      confirmUrl: `${env.LUPP_API_URL}/api/auth/confirm-email?token=${token}`,
    });
  }

  return reply.status(200).send({ sent: true });
}
