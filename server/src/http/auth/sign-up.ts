import { z } from "zod";
import bcrypt from "bcryptjs";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { ResourceAlreadyExistError } from "@/errors";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { issueAuthToken } from "@/lib/auth-tokens";
import { sendEmailConfirmation } from "@/lib/mailer";
import { PublicUserSchema, publicUserSelect, toPublicUser } from "./public-user";

const BodySchema = z.object({
  name: z.string().min(1).describe("Display name for the new account."),
  email: z.email().describe("Unique account email (credential)."),
  password: z.string().min(6).describe("Account password, minimum 6 characters."),
});

export const SignUpSchema = {
  schema: {
    summary: "Sign up",
    description:
      "Creates an account and emails a confirmation link. No session is issued: the email " +
      "must be confirmed before the first sign-in. A duplicate email returns 409.",
    tags: ["auth"],
    operationId: "signUp",
    body: BodySchema,
    response: {
      201: z.object({ user: PublicUserSchema }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function signUpHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);
  const email = body.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new ResourceAlreadyExistError("user", "email", email);

  const password_hash = await bcrypt.hash(body.password, 6);
  const user = await prisma.user.create({
    data: { name: body.name, email, password_hash },
    select: publicUserSelect,
  });

  const token = await issueAuthToken(user.id, "email_confirmation");
  await sendEmailConfirmation({
    to: email,
    name: user.name,
    confirmUrl: `${env.LUPP_API_URL}/api/auth/confirm-email?token=${token}`,
  });

  return reply.status(201).send({ user: toPublicUser(user) });
}
