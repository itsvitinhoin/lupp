import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createUser } from "../../../test/utils/create-user";

describe("GET /api/auth/me (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the account behind the bearer token", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      role: "agent",
    });
    expect(response.body.user.password_hash).toBeUndefined();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("returns 404 when the token's user no longer exists", async () => {
    const token = app.jwt.sign({
      sub: "00000000-0000-7000-8000-000000000000",
      role: "agent",
    });

    const response = await request(app.server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
