import { z } from "zod";
import bcrypt from "bcryptjs";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { UnauthorizedUserError, UserForbiddenError } from "@/errors";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import type { Role } from "@/schemas/roles";
import { PublicUserSchema, toPublicUser } from "./public-user";

const BodySchema = z.object({
  email: z.email().describe("Registered account email (credential)."),
  password: z.string().min(6).describe("Account password (credential)."),
});

export const SignInSchema = {
  schema: {
    summary: "Sign in",
    description:
      "Validates email/password and issues a short-lived access JWT in the body plus a 7-day " +
      "refresh JWT in an httpOnly `refreshToken` cookie. Unknown email and wrong password " +
      "return the same 401. An unconfirmed email returns 403 (the SPA offers to resend the " +
      "confirmation based on that message).",
    tags: ["auth"],
    operationId: "signIn",
    body: BodySchema,
    response: {
      200: z.object({
        token: z.string().describe("Signed access JWT carrying the user id (sub) and role."),
        user: PublicUserSchema,
      }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function signInHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  // Single generic 401 for unknown email and wrong password. OAuth-provisioned
  // accounts (placeholder password_hash) also land here — their way into
  // password sign-in is the reset-password flow.
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new UnauthorizedUserError("Invalid credentials.");
  }

  // Message is load-bearing: the SPA login page matches /not.*confirmed/i to
  // surface its resend-confirmation UI.
  if (!user.email_confirmed_at) {
    throw new UserForbiddenError("Email not confirmed.");
  }

  const role = user.role as Role;
  const token = await reply.jwtSign({ role }, { sign: { sub: user.id } });
  const refreshToken = await reply.jwtSign(
    { role },
    { sign: { sub: user.id, expiresIn: "7d" } },
  );

  return reply
    .setCookie("refreshToken", refreshToken, {
      path: "/",
      httpOnly: true,
      sameSite: true,
      secure: env.NODE_ENV === "production",
    })
    .status(200)
    .send({ token, user: toPublicUser(user) });
}
