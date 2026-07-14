import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { UnauthorizedUserError } from "@/errors";
import { errorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";

export const RefreshSchema = {
  schema: {
    summary: "Refresh session",
    description:
      "Rotates the session from the httpOnly `refreshToken` cookie (no body, no bearer " +
      "token): issues a fresh access JWT and a fresh 7-day refresh cookie. Refresh tokens " +
      "are stateless — sign-out clears the cookie but cannot revoke previously issued ones.",
    tags: ["auth"],
    operationId: "refreshSession",
    response: {
      200: z.object({
        token: z.string().describe("Newly signed access JWT carrying the user id (sub) and role."),
      }),
      ...errorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // onlyCookie: the credential is the refresh cookie, never a (possibly
    // stale) Authorization header.
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    throw new UnauthorizedUserError("Refresh token missing or invalid.");
  }

  const { role, sub } = request.user;
  const token = await reply.jwtSign({ role }, { sign: { sub } });
  const refreshToken = await reply.jwtSign(
    { role },
    { sign: { sub, expiresIn: "7d" } },
  );

  return reply
    .setCookie("refreshToken", refreshToken, {
      path: "/",
      httpOnly: true,
      sameSite: true,
      secure: env.NODE_ENV === "production",
    })
    .status(200)
    .send({ token });
}
