import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { mailer } from "@/lib/mailer";
import { createUser } from "../../../test/utils/create-user";

describe("POST /api/auth/reset-password (e2e)", () => {
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

  it("emails a reset link to an existing account", async () => {
    const user = await createUser({ password: "secret-123" });

    const response = await request(app.server)
      .post("/api/auth/reset-password")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true });
    expect(mailSpy).toHaveBeenCalledTimes(1);

    const mail = mailSpy.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.text).toMatch(/\/login\?reset=1&token=[A-Za-z0-9_-]+/);
  });

  it("answers 200 without sending for an unknown email", async () => {
    const response = await request(app.server)
      .post("/api/auth/reset-password")
      .send({ email: "ghost@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true });
    expect(mailSpy).not.toHaveBeenCalled();
  });
});
