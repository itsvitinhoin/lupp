import request from "supertest";
import { app } from "../../src/app";
import { createUser } from "./create-user";

/**
 * Creates a confirmed user with a real password and signs it in through
 * POST /api/auth/sessions, returning the access token and the refresh cookie.
 */
export async function createAndAuthenticateUser(
  overrides: Parameters<typeof createUser>[0] = {},
) {
  const password = overrides.password ?? "test-password-123";
  const user = await createUser({ ...overrides, password });

  const response = await request(app.server)
    .post("/api/auth/sessions")
    .send({ email: user.email, password });

  return {
    user,
    token: response.body.token as string,
    cookies: response.get("Set-Cookie") ?? [],
  };
}
