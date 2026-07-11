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
  process.env.SHOPIFY_CUSTOM_APPS_JSON = JSON.stringify({
    "custom-app-key": {
      client_secret: "custom-app-secret",
      shops: ["custom-shop.myshopify.com"],
    },
  });
  return { apiKey: "test-shopify-api-key" };
});

describe("POST /api/integrations/shopify/app-config (e2e)", () => {
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

  it("returns the default app api_key with the normalized shop", async () => {
    const response = await request(app.server)
      .post("/api/integrations/shopify/app-config")
      .send({ shop: "https://Some-Shop.myshopify.com/admin" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      api_key: TEST_ENV.apiKey,
      shop: "some-shop.myshopify.com",
    });
  });

  it("returns an empty shop when the domain is not a myshopify.com domain", async () => {
    const response = await request(app.server)
      .post("/api/integrations/shopify/app-config")
      .send({ shop: "not-a-shopify-domain.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ api_key: TEST_ENV.apiKey, shop: "" });
  });

  it("resolves a custom app from SHOPIFY_CUSTOM_APPS_JSON by shop domain", async () => {
    const response = await request(app.server)
      .post("/api/integrations/shopify/app-config")
      .send({ shop: "custom-shop.myshopify.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      api_key: "custom-app-key",
      shop: "custom-shop.myshopify.com",
    });
  });
});
