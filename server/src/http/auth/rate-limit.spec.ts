import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";

// trustProxy is on, so request.ip follows X-Forwarded-For. In tests loopback
// is allow-listed (src/app.ts), so the suite's normal supertest traffic is
// never throttled; here we forge a non-loopback X-Forwarded-For to exercise
// the limiter.
describe("Auth rate limiting (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("throttles POST /api/auth/sessions past the login limit with 429", async () => {
    const FORGED_IP = "203.0.113.7"; // TEST-NET-3, not loopback → not allow-listed
    let throttled: request.Response | undefined;

    for (let i = 0; i < env.RATE_LIMIT_LOGIN_MAX + 2; i++) {
      const response = await request(app.server)
        .post("/api/auth/sessions")
        .set("x-forwarded-for", FORGED_IP)
        .send({ email: "nobody@example.com", password: "wrong-password" });
      if (response.status === 429) {
        throttled = response;
        break;
      }
    }

    expect(throttled?.status).toBe(429);
    expect(throttled?.body.message).toMatch(/too many/i);
  });

  it("does not throttle an allow-listed (loopback) client", async () => {
    // No X-Forwarded-For → request.ip is loopback, allow-listed in tests.
    for (let i = 0; i < env.RATE_LIMIT_LOGIN_MAX + 5; i++) {
      const response = await request(app.server)
        .post("/api/auth/sessions")
        .send({ email: "nobody@example.com", password: "wrong-password" });
      expect(response.status).not.toBe(429);
    }
  });
});
