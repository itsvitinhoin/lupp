import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../../test/utils/create-user";

describe("POST /api/auth/sessions (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("signs in with valid credentials and sets the refresh cookie", async () => {
    const user = await createUser({ password: "secret-123" });

    const response = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "secret-123" });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, email: user.email });
    expect(response.body.user.password_hash).toBeUndefined();

    const payload = app.jwt.verify<{ sub: string; role: string }>(response.body.token);
    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe("agent");

    const cookies = response.get("Set-Cookie") ?? [];
    const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("Path=/");
  });

  it("accepts a differently-cased email", async () => {
    const user = await createUser({
      email: "cased-signin@example.com",
      password: "secret-123",
    });

    const response = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: "Cased-SignIn@Example.com", password: "secret-123" });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
  });

  it("rejects a wrong password and an unknown email with the same 401", async () => {
    const user = await createUser({ password: "secret-123" });

    const wrongPassword = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "wrong-password" });
    const unknownEmail = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: "nobody@example.com", password: "secret-123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it("rejects an unconfirmed account with a 403 the SPA can detect", async () => {
    const user = await createUser({
      password: "secret-123",
      email_confirmed_at: null,
    });

    const response = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "secret-123" });

    expect(response.status).toBe(403);
    // login.tsx matches /not.*confirmed/i to offer resending the confirmation.
    expect(response.body.message).toMatch(/not.*confirmed/i);
  });

  it("rejects an OAuth-provisioned account (placeholder hash) with 401", async () => {
    // Shopify/Nuvemshop callbacks create users with a random UUID as
    // password_hash — bcrypt.compare must fail, not throw.
    const user = await prisma.user.create({
      data: {
        name: "OAuth User",
        email: "oauth-user@example.com",
        password_hash: randomUUID(),
        email_confirmed_at: new Date(),
      },
    });

    const response = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "secret-123" });

    expect(response.status).toBe(401);
  });
});
