import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { mailer } from "@/lib/mailer";

describe("POST /api/auth/sign-up (e2e)", () => {
  let mailSpy: MockInstance<typeof mailer.send>;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    mailSpy = vi.spyOn(mailer, "send");
  });

  it("creates an unconfirmed account and emails a confirmation link", async () => {
    const email = "new-user@example.com";

    const response = await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "New User", email, password: "secret-123" });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: "New User",
      email,
      email_confirmed_at: null,
    });
    expect(response.body.user.password_hash).toBeUndefined();

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(dbUser.email_confirmed_at).toBeNull();
    expect(bcrypt.compareSync("secret-123", dbUser.password_hash)).toBe(true);

    expect(mailSpy).toHaveBeenCalledTimes(1);
    const mail = mailSpy.mock.calls[0][0];
    expect(mail.to).toBe(email);
    expect(mail.text).toMatch(/\/api\/auth\/confirm-email\?token=[A-Za-z0-9_-]+/);
  });

  it("stores the email lowercased", async () => {
    const response = await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "Cased", email: "Cased.User@Example.com", password: "secret-123" });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("cased.user@example.com");
  });

  it("rejects a duplicate email with 409", async () => {
    const email = "taken@example.com";
    await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "First", email, password: "secret-123" });

    const response = await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "Second", email, password: "another-123" });

    expect(response.status).toBe(409);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("rejects an invalid payload with 400", async () => {
    const response = await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "Shorty", email: "shorty@example.com", password: "12345" });

    expect(response.status).toBe(400);
    expect(mailSpy).not.toHaveBeenCalled();
  });
});
