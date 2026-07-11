import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";

describe("GET /health (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports ok when the database is reachable", async () => {
    const response = await request(app.server).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "ok" });
  });
});
