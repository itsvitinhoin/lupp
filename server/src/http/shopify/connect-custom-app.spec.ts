import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { ShopifyRoutes } from "./routes";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

// Shopify env must exist before "@/app" (and its env module) is imported —
// vi.hoisted runs before the static imports above.
vi.hoisted(() => {
  process.env.SHOPIFY_API_KEY = "test-shopify-api-key";
  process.env.SHOPIFY_API_SECRET = "test-shopify-api-secret";
  process.env.SHOPIFY_STATE_SECRET = "test-shopify-state-secret";
});

const ROUTE = "/api/integrations/shopify/connect-custom-app";
const SHOP = "custom-shop.myshopify.com";

function stubShopifyFetch(options?: {
  shopStatus?: number;
  shopBody?: Record<string, unknown>;
  tokenStatus?: number;
  tokenBody?: Record<string, unknown>;
}) {
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/admin/oauth/access_token")) {
      return new Response(
        JSON.stringify(
          options?.tokenBody ?? {
            access_token: "shpca_client_credentials_token",
            expires_in: 86_400,
            scope: "read_products",
          },
        ),
        { status: options?.tokenStatus ?? 200 },
      );
    }
    if (href.includes("/shop.json")) {
      return new Response(
        JSON.stringify(
          options?.shopBody ?? {
            shop: {
              domain: "shop.custom-store.com.br",
              id: 987654321,
              myshopify_domain: SHOP,
              name: "Custom Store",
            },
          },
        ),
        { status: options?.shopStatus ?? 200 },
      );
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("POST /api/integrations/shopify/connect-custom-app (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post(ROUTE)
      .send({ store_id: "any", shop: SHOP });

    expect(response.status).toBe(401);
  });

  it("rejects missing/invalid fields with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ shop: SHOP, access_token: "shpat_valid_token_123" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const missingShop = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store", shop: "invalid domain!" });
    expect(missingShop.status).toBe(400);
    expect(missingShop.body).toEqual({ error: "missing_shopify_shop_domain" });

    const missingCredentials = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store", shop: SHOP });
    expect(missingCredentials.status).toBe(400);
    expect(missingCredentials.body).toEqual({
      error: "missing_shopify_credentials",
    });

    const badToken = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store", shop: SHOP, access_token: "short" });
    expect(badToken.status).toBe(400);
    expect(badToken.body).toEqual({ error: "invalid_shopify_admin_api_token" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: SHOP,
        access_token: "shpat_valid_token_123",
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 401 when Shopify rejects the manual token", async () => {
    stubShopifyFetch({ shopStatus: 401, shopBody: { errors: "Unauthorized" } });
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: SHOP,
        access_token: "shpat_rejected_token_123",
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("shopify_custom_app_validation_failed");
    expect(response.body.message).toBe("Unauthorized");
  });

  it("connects with a manual Admin API token and expands the bare shop handle", async () => {
    const fetchMock = stubShopifyFetch();
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: "custom-shop",
        access_token: "shpat_manual_admin_token",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      shop_domain: SHOP,
      shop_name: "Custom Store",
    });

    // Manual mode never hits the token endpoint, only shop.json.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `https://${SHOP}/admin/api/`,
    );

    const integration = await prisma.integration.findUniqueOrThrow({
      where: { id: response.body.integration_id },
    });
    expect(integration.store_id).toBe(store.id);
    expect(integration.external_store_id).toBe(SHOP);
    expect(integration.settings).toMatchObject({
      connected_via: "custom_app_manual",
      shopify_shop_id: "987654321",
    });

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
    expect(secret.access_token).toBe("shpat_manual_admin_token");
    expect(secret.token_type).toBe("admin_api_access_token");
    expect(secret.metadata).toMatchObject({
      non_expiring_admin_token: true,
      source: "custom_app_manual",
    });

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { platform: true, url: true },
    });
    expect(updatedStore.platform).toBe("shopify");
    expect(updatedStore.url).toBe("https://shop.custom-store.com.br");
  });

  it("connects with client credentials, requesting a token on the merchant's behalf", async () => {
    // Distinct shop: integrations are also unique per (provider, shop domain).
    const ccShop = "cc-shop.myshopify.com";
    const fetchMock = stubShopifyFetch({
      shopBody: {
        shop: { id: 123, myshopify_domain: ccShop, name: "CC Store" },
      },
    });
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: ccShop,
        client_id: "custom-client-id",
        client_secret: "custom-client-secret",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/admin/oauth/access_token"),
    );
    expect(String(tokenCall?.[1]?.body)).toContain(
      "grant_type=client_credentials",
    );

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: response.body.integration_id },
    });
    expect(secret.access_token).toBe("shpca_client_credentials_token");
    expect(secret.token_type).toBe("bearer");
    expect(secret.metadata).toMatchObject({
      client_id: "custom-client-id",
      client_secret: "custom-client-secret",
      source: "custom_app_client_credentials",
    });
  });

  it("returns 401 when the client credentials are rejected", async () => {
    stubShopifyFetch({
      tokenStatus: 401,
      tokenBody: { error: "invalid_client" },
    });
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        shop: SHOP,
        client_id: "bad-client-id",
        client_secret: "bad-client-secret",
      });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "shopify_client_credentials_token_failed",
      message: "invalid_client",
      status: 401,
    });
  });
});
