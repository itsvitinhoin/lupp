import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createAndAuthenticateUser } from "../../../test/utils/create-and-authenticate-user";

describe("DELETE /api/auth/sessions (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("clears the refresh cookie of a signed-in session", async () => {
    const { cookies } = await createAndAuthenticateUser();

    const response = await request(app.server)
      .delete("/api/auth/sessions")
      .set("Cookie", cookies);

    expect(response.status).toBe(204);
    const setCookies = response.get("Set-Cookie") ?? [];
    const cleared = setCookies.find((c) => c.startsWith("refreshToken="));
    // An expired empty cookie is how clearCookie tells the browser to drop it.
    expect(cleared).toMatch(/refreshToken=;/);
    expect(cleared).toContain("Expires=");
  });

  it("is idempotent — succeeds without any session", async () => {
    const response = await request(app.server).delete("/api/auth/sessions");

    expect(response.status).toBe(204);
  });
});
