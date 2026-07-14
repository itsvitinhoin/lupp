import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createAndAuthenticateUser } from "../../../test/utils/create-and-authenticate-user";

describe("PATCH /api/auth/sessions/refresh (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rotates the session from the refresh cookie", async () => {
    const { user, cookies } = await createAndAuthenticateUser();

    const response = await request(app.server)
      .patch("/api/auth/sessions/refresh")
      .set("Cookie", cookies);

    expect(response.status).toBe(200);
    const payload = app.jwt.verify<{ sub: string; role: string }>(response.body.token);
    expect(payload.sub).toBe(user.id);

    const newCookies = response.get("Set-Cookie") ?? [];
    expect(newCookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("rejects a missing cookie with 401", async () => {
    const response = await request(app.server).patch("/api/auth/sessions/refresh");

    expect(response.status).toBe(401);
  });

  it("rejects a garbage cookie with 401", async () => {
    const response = await request(app.server)
      .patch("/api/auth/sessions/refresh")
      .set("Cookie", "refreshToken=not-a-jwt");

    expect(response.status).toBe(401);
  });

  it("ignores the Authorization header — the cookie is the only credential", async () => {
    const { token } = await createAndAuthenticateUser();

    const response = await request(app.server)
      .patch("/api/auth/sessions/refresh")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
