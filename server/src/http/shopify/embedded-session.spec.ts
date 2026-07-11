import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { verifyShopifyState } from "@/lib/shopify";
import { ShopifyRoutes } from "./routes";
import { createStore } from "../../../test/utils/create-store";

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
    apiSecret: "test-shopify-api-secret",
    stateSecret: "test-shopify-state-secret",
  };
});

const ROUTE = "/api/integrations/shopify/embedded-session";

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

function sessionTokenForShop(
  shop: string,
  overrides: Record<string, unknown> = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return signSessionToken({
    aud: TEST_ENV.apiKey,
    dest: `https://${shop}`,
    exp: now + 60,
    iss: `https://${shop}/admin`,
    nbf: now - 10,
    sid: "session-1",
    sub: "merchant-user-1",
    ...overrides,
  });
}

async function seedConnectedShop(shop: string) {
  const { owner, store } = await createStore();
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "shopify",
      status: "active",
      external_store_id: shop,
      connected_at: new Date(),
      settings: { connected_via: "oauth", shop_domain: shop },
    },
  });
  await prisma.integrationSecret.create({
    data: {
      integration_id: integration.id,
      provider: "shopify",
      external_store_id: shop,
      access_token: "shpat_stored_token",
      token_type: "bearer",
      metadata: { shop_domain: shop },
    },
  });
  return { owner, store, integration };
}

describe("POST /api/integrations/shopify/embedded-session (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a missing session token", async () => {
    const response = await request(app.server).post(ROUTE).send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "missing_session_token" });
  });

  it("rejects a forged session token", async () => {
    const token = sessionTokenForShop("forged-shop.myshopify.com");
    const forged = `${token.slice(0, token.lastIndexOf(".") + 1)}${Buffer.from(
      "forged-signature",
    ).toString("base64url")}`;

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${forged}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_token_signature" });
  });

  it("answers 409 with a bootstrap authorize_url when the shop has no integration", async () => {
    const shop = "unconnected-shop.myshopify.com";
    const token = sessionTokenForShop(shop);

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ host: "aG9zdA" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("shopify_oauth_required");
    expect(response.body.shop).toBe(shop);

    const authorizeUrl = new URL(response.body.authorize_url);
    expect(authorizeUrl.origin).toBe(`https://${shop}`);
    expect(authorizeUrl.pathname).toBe("/admin/oauth/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(TEST_ENV.apiKey);

    const state = verifyShopifyState(
      authorizeUrl.searchParams.get("state") ?? "",
      TEST_ENV.stateSecret,
    );
    expect(state).toMatchObject({
      host: "aG9zdA",
      mode: "embedded_bootstrap",
      shop,
    });
    expect(state?.return_to).toContain("https://app.lupp.test/app");
    expect(state?.return_to).toContain(`shop=${encodeURIComponent(shop)}`);
  });

  it("answers 409 when the integration exists but has no stored access token", async () => {
    const shop = "tokenless-shop.myshopify.com";
    const { store } = await createStore();
    await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "shopify",
        status: "active",
        external_store_id: shop,
      },
    });
    const token = sessionTokenForShop(shop);

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("shopify_oauth_required");
    expect(response.body.authorize_url).toContain(shop);
  });

  it("returns the store context for a connected shop", async () => {
    const shop = "connected-shop.myshopify.com";
    const { owner, store, integration } = await seedConnectedShop(shop);
    const token = sessionTokenForShop(shop);

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.shop).toBe(shop);
    expect(response.body.integration).toMatchObject({
      id: integration.id,
      store_id: store.id,
      provider: "shopify",
      status: "active",
      external_store_id: shop,
    });
    expect(response.body.store.id).toBe(store.id);
    expect(response.body.profile).toMatchObject({
      id: owner.id,
      email: owner.email,
    });
    // The merged users table holds password_hash — it must never leak.
    expect(response.body.profile.password_hash).toBeUndefined();
    expect(response.body.store.password_hash).toBeUndefined();
    expect(response.body.user).toMatchObject({
      aud: "authenticated",
      email: owner.email,
      id: owner.id,
      role: "authenticated",
      app_metadata: { provider: "shopify_embedded" },
      user_metadata: { name: owner.name, shop },
    });
  });
});
