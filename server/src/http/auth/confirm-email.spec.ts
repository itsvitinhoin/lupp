import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { mailer, type MailMessage } from "@/lib/mailer";
import { createUser } from "../../../test/utils/create-user";

function tokenFromMail(mail: MailMessage): string {
  const match = mail.text.match(/token=([A-Za-z0-9_-]+)/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("GET /api/auth/confirm-email (e2e)", () => {
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

  // Sign-up no longer issues a confirmation token itself (email confirmation
  // is disabled — see sign-up.ts), so bootstrap a token through
  // resend-confirmation against a manually created unconfirmed user instead.
  async function signUp(email: string) {
    await createUser({ email, email_confirmed_at: null });
    await request(app.server).post("/api/auth/resend-confirmation").send({ email });
    return tokenFromMail(mailSpy.mock.calls.at(-1)![0]);
  }

  it("confirms the account and redirects to the SPA", async () => {
    const email = "confirm-me@example.com";
    const token = await signUp(email);

    const response = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.LUPP_APP_URL}/login?confirmed=1`);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.email_confirmed_at).not.toBeNull();
  });

  it("rejects a reused token with the error redirect", async () => {
    const token = await signUp("confirm-twice@example.com");

    await request(app.server).get("/api/auth/confirm-email").query({ token });
    const response = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.LUPP_APP_URL}/login?confirm_error=1`);
  });

  it("rejects an expired token with the error redirect", async () => {
    const email = "confirm-late@example.com";
    const token = await signUp(email);
    await prisma.authToken.updateMany({
      where: { user: { email } },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const response = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.LUPP_APP_URL}/login?confirm_error=1`);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.email_confirmed_at).toBeNull();
  });

  it("rejects an unknown token with the error redirect", async () => {
    const response = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token: "definitely-not-issued" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${env.LUPP_APP_URL}/login?confirm_error=1`);
  });
});
