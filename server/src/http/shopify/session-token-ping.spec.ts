import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { ShopifyRoutes } from "./routes";

// Shopify env must exist before "@/app" (and its env module) is imported —
// vi.hoisted runs before the static imports above.
const TEST_ENV = vi.hoisted(() => {
  process.env.SHOPIFY_API_KEY = "test-shopify-api-key";
  process.env.SHOPIFY_API_SECRET = "test-shopify-api-secret";
  process.env.SHOPIFY_STATE_SECRET = "test-shopify-state-secret";
  return {
    apiKey: "test-shopify-api-key",
    apiSecret: "test-shopify-api-secret",
  };
});

const SHOP = "ping-shop.myshopify.com";

function signSessionToken(
  payload: Record<string, unknown>,
  secret = TEST_ENV.apiSecret,
) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function sessionPayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: TEST_ENV.apiKey,
    dest: `https://${SHOP}`,
    exp: now + 60,
    iss: `https://${SHOP}/admin`,
    nbf: now - 10,
    sid: "session-1",
    sub: "merchant-user-1",
    ...overrides,
  };
}

describe("POST /api/integrations/shopify/session-token-ping (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
    // This route never touches the DB, but the vitest worker only tears down
    // cleanly once the prisma pool has connected at least once.
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a missing session token", async () => {
    const response = await request(app.server)
      .post("/api/integrations/shopify/session-token-ping")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "missing_session_token" });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = signSessionToken(sessionPayload(), "wrong-secret");

    const response = await request(app.server)
      .post("/api/integrations/shopify/session-token-ping")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_token_signature" });
  });

  it("rejects an expired token", async () => {
    const token = signSessionToken(
      sessionPayload({ exp: Math.floor(Date.now() / 1000) - 30 }),
    );

    const response = await request(app.server)
      .post("/api/integrations/shopify/session-token-ping")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "token_expired" });
  });

  it("rejects a token for another app (audience mismatch)", async () => {
    const token = signSessionToken(sessionPayload({ aud: "other-app-key" }));

    const response = await request(app.server)
      .post("/api/integrations/shopify/session-token-ping")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_token_audience" });
  });

  it("echoes dest and sub for a valid token", async () => {
    const token = signSessionToken(sessionPayload());

    const response = await request(app.server)
      .post("/api/integrations/shopify/session-token-ping")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      dest: `https://${SHOP}`,
      sub: "merchant-user-1",
    });
  });
});
