import { createHmac } from "node:crypto";
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
import { createPlans } from "../../../test/utils/create-plans";
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
    apiSecret: "test-shopify-api-secret",
    stateSecret: "test-shopify-state-secret",
  };
});

const CALLBACK_PATH = "/api/integrations/shopify/oauth/callback";
const FALLBACK_RETURN_TO = "https://app.lupp.test/app/integrations";

function signState(
  payload: Record<string, unknown>,
  secret = TEST_ENV.stateSecret,
) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

// Shopify's request HMAC: hex HMAC-SHA256 over the sorted query params
// (hmac/signature excluded).
function withRequestHmac(params: Record<string, string>) {
  const message = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const hmac = createHmac("sha256", TEST_ENV.apiSecret)
    .update(message)
    .digest("hex");
  return { ...params, hmac };
}

function stubTokenExchange(
  body: Record<string, unknown> = {
    access_token: "shpat_fresh_token",
    expires_in: 86_400,
    refresh_token: "refresh_token_1",
    refresh_token_expires_in: 2_592_000,
    scope: "read_products,read_inventory",
  },
  status = 200,
) {
  const fetchMock = vi.fn(
    async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/integrations/shopify/oauth/callback (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
    await createPlans();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects with missing_shopify_oauth_params when code/shop/state are absent", async () => {
    const response = await request(app.server).get(CALLBACK_PATH);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(FALLBACK_RETURN_TO);
    expect(location.searchParams.get("error")).toBe(
      "missing_shopify_oauth_params",
    );
    expect(location.searchParams.get("provider")).toBe("shopify");
  });

  it("rejects a tampered state (signed with another secret)", async () => {
    const shop = "tampered-shop.myshopify.com";
    const state = signState(
      {
        iat: Math.floor(Date.now() / 1000),
        mode: "embedded_bootstrap",
        shop,
      },
      "attacker-secret",
    );

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(withRequestHmac({ code: "abc", shop, state }));

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "invalid_oauth_state",
    );
  });

  it("rejects a state whose shop does not match the query shop", async () => {
    const state = signState({
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      shop: "other-shop.myshopify.com",
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(
        withRequestHmac({ code: "abc", shop: "shop-a.myshopify.com", state }),
      );

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "invalid_oauth_state",
    );
  });

  it("rejects an invalid Shopify request HMAC", async () => {
    const shop = "hmac-shop.myshopify.com";
    const state = signState({
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      shop,
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", shop, state, hmac: "deadbeef" });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "invalid_shopify_hmac",
    );
  });

  it("redirects with shopify_token_exchange_failed when Shopify rejects the code", async () => {
    stubTokenExchange({ error: "invalid_request" }, 400);
    const { owner, store } = await createStore();
    const shop = "failing-shop.myshopify.com";
    const state = signState({
      iat: Math.floor(Date.now() / 1000),
      return_to: "https://app.lupp.test/app/integrations",
      shop,
      store_id: store.id,
      user_id: owner.id,
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(withRequestHmac({ code: "bad-code", shop, state }));

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "shopify_token_exchange_failed",
    );
  });

  it("connects an existing store: token exchange + integration/secret upserts", async () => {
    const fetchMock = stubTokenExchange();
    const { owner, store } = await createStore();
    const shop = "connected-shop.myshopify.com";
    const returnTo = "https://app.lupp.test/app/integrations?connected=1";
    const state = signState({
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo,
      shop,
      store_id: store.id,
      user_id: owner.id,
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(withRequestHmac({ code: "good-code", shop, state }));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(location.searchParams.get("connected")).toBe("shopify");
    expect(location.searchParams.get("provider")).toBe("shopify");

    expect(fetchMock).toHaveBeenCalledWith(
      `https://${shop}/admin/oauth/access_token`,
      expect.objectContaining({ method: "POST" }),
    );
    const tokenBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(tokenBody).toContain("code=good-code");
    expect(tokenBody).toContain("expiring=1");

    const integration = await prisma.integration.findUniqueOrThrow({
      where: {
        store_id_provider: { store_id: store.id, provider: "shopify" },
      },
    });
    expect(integration.status).toBe("active");
    expect(integration.external_store_id).toBe(shop);
    expect(integration.settings).toMatchObject({
      connected_via: "oauth",
      shop_domain: shop,
    });

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
    expect(secret.access_token).toBe("shpat_fresh_token");
    expect(secret.token_type).toBe("bearer");
    expect(secret.metadata).toMatchObject({
      expiring_offline: true,
      refresh_token: "refresh_token_1",
      shop_domain: shop,
    });

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { platform: true },
    });
    expect(updatedStore.platform).toBe("shopify");
  });

  it("embedded_bootstrap provisions the full store chain", async () => {
    stubTokenExchange();
    const shop = "boot-shop.myshopify.com";
    const state = signState({
      host: "aG9zdA",
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      return_to: `https://app.lupp.test/app?shop=${shop}`,
      shop,
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(withRequestHmac({ code: "boot-code", shop, state }));

    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.location).searchParams.get("connected"),
    ).toBe("shopify");

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "shopify+boot-shop-myshopify-com@playluup.local" },
    });
    expect(owner.name).toBe("Boot Shop");

    const store = await prisma.store.findFirstOrThrow({
      where: { owner_id: owner.id },
    });
    expect(store.platform).toBe("shopify");
    expect(store.segment).toBe("ecommerce");
    expect(store.plan_id).toBe("start");
    expect(store.url).toBe(`https://${shop}`);
    expect(store.slug.startsWith("boot-shop-")).toBe(true);
    expect(store.trial_ends_at).not.toBeNull();

    const membership = await prisma.storeMember.findUniqueOrThrow({
      where: {
        store_id_user_id: { store_id: store.id, user_id: owner.id },
      },
    });
    expect(membership.role).toBe("owner");

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { store_id: store.id },
    });
    expect(subscription.status).toBe("trialing");
    expect(subscription.plan_id).toBe("start");
    expect(subscription.current_period_end).not.toBeNull();

    const widgets = await prisma.widget.findMany({
      where: { store_id: store.id },
      orderBy: { name: "asc" },
    });
    expect(widgets.map((widget) => widget.type).sort()).toEqual([
      "floating_video",
      "home_showcase",
      "product_video",
      "stories_bar",
    ]);
    const floating = widgets.find(
      (widget) => widget.type === "floating_video",
    );
    expect(floating?.status).toBe("active");
    expect(floating?.settings).toMatchObject({
      carousel: expect.objectContaining({ enabled: true, max_items: 12 }),
      display: expect.objectContaining({
        exclude_paths: ["/checkout", "/carrinho", "/cart"],
      }),
    });

    const page = await prisma.customPage.findUniqueOrThrow({
      where: { store_id_slug: { store_id: store.id, slug: "videos" } },
    });
    expect(page.name).toBe("Feed Principal");
    expect(page.status).toBe("draft");

    const feedSettings = await prisma.feedSetting.findUniqueOrThrow({
      where: { store_id: store.id },
    });
    expect(feedSettings.slug).toBe("videos");

    const integration = await prisma.integration.findUniqueOrThrow({
      where: {
        store_id_provider: { store_id: store.id, provider: "shopify" },
      },
    });
    expect(integration.status).toBe("active");
    expect(integration.external_store_id).toBe(shop);
    await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
  });

  it("reuses the existing bootstrap store on a second embedded_bootstrap callback", async () => {
    stubTokenExchange();
    const shop = "boot-shop.myshopify.com";
    const state = signState({
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      return_to: `https://app.lupp.test/app?shop=${shop}`,
      shop,
    });

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query(withRequestHmac({ code: "boot-code-2", shop, state }));

    expect(response.status).toBe(302);
    expect(
      new URL(response.headers.location).searchParams.get("connected"),
    ).toBe("shopify");

    const integrations = await prisma.integration.findMany({
      where: { provider: "shopify", external_store_id: shop },
    });
    expect(integrations).toHaveLength(1);

    const owners = await prisma.user.findMany({
      where: { email: { startsWith: "shopify+boot-shop" } },
    });
    expect(owners).toHaveLength(1);
  });
});
