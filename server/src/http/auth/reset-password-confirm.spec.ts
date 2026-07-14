import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { mailer, type MailMessage } from "@/lib/mailer";
import { createUser } from "../../../test/utils/create-user";

function tokenFromMail(mail: MailMessage): string {
  const match = mail.text.match(/token=([A-Za-z0-9_-]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("POST /api/auth/reset-password/confirm (e2e)", () => {
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

  async function requestReset(email: string) {
    await request(app.server).post("/api/auth/reset-password").send({ email });
    return tokenFromMail(mailSpy.mock.calls.at(-1)![0]);
  }

  it("replaces the password: old one stops working, new one signs in", async () => {
    const user = await createUser({ password: "old-secret" });
    const token = await requestReset(user.email);

    const response = await request(app.server)
      .post("/api/auth/reset-password/confirm")
      .send({ token, password: "new-secret" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reset: true });

    const oldPassword = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "old-secret" });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "new-secret" });
    expect(newPassword.status).toBe(200);
  });

  it("consumes the token — a second use is a 400", async () => {
    const user = await createUser({ password: "old-secret" });
    const token = await requestReset(user.email);

    await request(app.server)
      .post("/api/auth/reset-password/confirm")
      .send({ token, password: "new-secret" });
    const reuse = await request(app.server)
      .post("/api/auth/reset-password/confirm")
      .send({ token, password: "sneaky-secret" });

    expect(reuse.status).toBe(400);
  });

  it("rejects an expired token with 400", async () => {
    const user = await createUser({ password: "old-secret" });
    const token = await requestReset(user.email);
    await prisma.authToken.updateMany({
      where: { user_id: user.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const response = await request(app.server)
      .post("/api/auth/reset-password/confirm")
      .send({ token, password: "new-secret" });

    expect(response.status).toBe(400);
  });

  it("also confirms the email — the onboarding path for OAuth-provisioned users", async () => {
    // Store OAuth callbacks create users with a placeholder hash and (before
    // this feature) no confirmation; the reset flow is how they gain password
    // sign-in.
    const user = await prisma.user.create({
      data: {
        name: "OAuth User",
        email: `oauth-${randomUUID()}@example.com`,
        password_hash: randomUUID(),
      },
    });
    const token = await requestReset(user.email);

    const response = await request(app.server)
      .post("/api/auth/reset-password/confirm")
      .send({ token, password: "chosen-secret" });
    expect(response.status).toBe(200);

    const signIn = await request(app.server)
      .post("/api/auth/sessions")
      .send({ email: user.email, password: "chosen-secret" });
    expect(signIn.status).toBe(200);
  });
});
