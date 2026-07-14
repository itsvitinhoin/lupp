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

describe("POST /api/auth/resend-confirmation (e2e)", () => {
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

  it("sends a fresh working link for an unconfirmed account", async () => {
    const user = await createUser({ email_confirmed_at: null });

    const response = await request(app.server)
      .post("/api/auth/resend-confirmation")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true });
    expect(mailSpy).toHaveBeenCalledTimes(1);

    const token = tokenFromMail(mailSpy.mock.calls[0][0]);
    const confirm = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token });
    expect(confirm.headers.location).toBe(`${env.LUPP_APP_URL}/login?confirmed=1`);

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.email_confirmed_at).not.toBeNull();
  });

  it("invalidates previously issued confirmation tokens", async () => {
    const email = "resend-invalidates@example.com";
    await request(app.server)
      .post("/api/auth/sign-up")
      .send({ name: "Resend", email, password: "secret-123" });
    const firstToken = tokenFromMail(mailSpy.mock.calls.at(-1)![0]);

    await request(app.server).post("/api/auth/resend-confirmation").send({ email });

    const staleAttempt = await request(app.server)
      .get("/api/auth/confirm-email")
      .query({ token: firstToken });
    expect(staleAttempt.headers.location).toBe(
      `${env.LUPP_APP_URL}/login?confirm_error=1`,
    );
  });

  it("answers 200 without sending for an unknown email", async () => {
    const response = await request(app.server)
      .post("/api/auth/resend-confirmation")
      .send({ email: "ghost@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true });
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("answers 200 without sending for an already confirmed account", async () => {
    const user = await createUser();

    const response = await request(app.server)
      .post("/api/auth/resend-confirmation")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(mailSpy).not.toHaveBeenCalled();
  });
});
