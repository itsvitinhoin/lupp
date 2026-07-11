import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { verifyShopifyState } from "@/lib/shopify";
import { ShopifyRoutes } from "./routes";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

// Shopify env must exist before "@/app" (and its env module) is imported —
// vi.hoisted runs before the static imports above.
const TEST_ENV = vi.hoisted(() => {
  process.env.SHOPIFY_API_KEY = "test-shopify-api-key";
  process.env.SHOPIFY_API_SECRET = "test-shopify-api-secret";
  process.env.SHOPIFY_STATE_SECRET = "test-shopify-state-secret";
  process.env.SHOPIFY_APP_URL = "https://app.lupp.test";
  process.env.SHOPIFY_REDIRECT_URI =
    "https://api.lupp.test/api/integrations/shopify/oauth/callback";
  return {
    apiKey: "test-shopify-api-key",
    stateSecret: "test-shopify-state-secret",
    redirectUri: "https://api.lupp.test/api/integrations/shopify/oauth/callback",
  };
});

describe("POST /api/integrations/shopify/oauth/start (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .send({ store_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("returns 404 for an unknown store", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "00000000-0000-0000-0000-000000000000" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "store_not_found" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, shop: "any-shop.myshopify.com" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("rejects when no shop domain can be inferred", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, shop: "not-a-shopify-domain.com" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_shopify_shop_domain" });
  });

  it("builds the authorize URL with a verifiable signed state", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: "https://Start-Shop.myshopify.com/",
        return_to: "https://app.lupp.test/app/integrations?tab=shopify",
      });

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe("start-shop.myshopify.com");

    const authorizeUrl = new URL(response.body.authorize_url);
    expect(authorizeUrl.origin).toBe("https://start-shop.myshopify.com");
    expect(authorizeUrl.pathname).toBe("/admin/oauth/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(TEST_ENV.apiKey);
    expect(authorizeUrl.searchParams.get("scope")).toBe(
      "read_products,read_inventory,read_locations",
    );
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      TEST_ENV.redirectUri,
    );

    const state = authorizeUrl.searchParams.get("state") ?? "";
    const payload = verifyShopifyState(state, TEST_ENV.stateSecret);
    expect(payload).toMatchObject({
      return_to: "https://app.lupp.test/app/integrations?tab=shopify",
      shop: "start-shop.myshopify.com",
      store_id: store.id,
      user_id: owner.id,
    });
  });

  it("infers the shop domain from the store url", async () => {
    const { owner, store } = await createStore();
    await prisma.store.update({
      where: { id: store.id },
      data: { url: "https://inferred-shop.myshopify.com" },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/shopify/oauth/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe("inferred-shop.myshopify.com");
  });
});
