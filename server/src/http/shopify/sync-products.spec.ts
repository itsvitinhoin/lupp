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

const ROUTE = "/api/integrations/shopify/sync-products";

function productNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/1001",
    legacyResourceId: "1001",
    title: "Vestido Midi",
    handle: "vestido-midi",
    descriptionHtml: "<p>Um vestido <b>lindo</b></p>",
    status: "ACTIVE",
    onlineStoreUrl: null,
    featuredImage: { url: "https://cdn.shopify.test/vestido.jpg" },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/2001",
            legacyResourceId: "2001",
            title: "Vermelho / M",
            sku: "VM-M",
            price: "199.90",
            compareAtPrice: "249.90",
            availableForSale: true,
            selectedOptions: [
              { name: "Cor", value: "Vermelho" },
              { name: "Tamanho", value: "M" },
            ],
            image: { url: "https://cdn.shopify.test/vestido-vermelho.jpg" },
          },
        },
      ],
    },
    ...overrides,
  };
}

function graphqlPage(
  nodes: Array<Record<string, unknown>>,
  pageInfo: { endCursor: string | null; hasNextPage: boolean },
) {
  return {
    data: {
      products: {
        edges: nodes.map((node, index) => ({
          cursor: `cursor-${index}`,
          node,
        })),
        pageInfo,
      },
    },
  };
}

async function seedShopifyIntegration(options?: {
  secretMetadata?: Record<string, string | number | boolean | null>;
  tokenType?: string;
  shop?: string;
}) {
  const shop = options?.shop ?? "sync-shop.myshopify.com";
  const { owner, store } = await createStore();
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "shopify",
      status: "active",
      external_store_id: shop,
      settings: { connected_via: "oauth", shop_domain: shop },
    },
  });
  const secret = await prisma.integrationSecret.create({
    data: {
      integration_id: integration.id,
      provider: "shopify",
      external_store_id: shop,
      access_token: "shpat_stored_token",
      token_type: options?.tokenType ?? "admin_api_access_token",
      metadata: options?.secretMetadata ?? { non_expiring_admin_token: true },
    },
  });
  return { owner, store, integration, secret, shop };
}

describe("POST /api/integrations/shopify/sync-products (e2e)", () => {
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
      .send({ store_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("rejects a store without an active Shopify integration", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "shopify_not_connected" });
  });

  it("paginates the GraphQL catalog and upserts products + variants", async () => {
    const { owner, store, integration, shop } = await seedShopifyIntegration();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const pageOne = graphqlPage([productNode()], {
      endCursor: "cursor-page-1",
      hasNextPage: true,
    });
    const pageTwo = graphqlPage(
      [
        productNode({
          id: "gid://shopify/Product/1002",
          legacyResourceId: "1002",
          title: "Calça Jeans",
          handle: "calca-jeans",
          status: "DRAFT",
          variants: {
            edges: [
              {
                node: {
                  id: "gid://shopify/ProductVariant/2002",
                  legacyResourceId: "2002",
                  title: "Azul / G",
                  sku: "CJ-G",
                  price: "149.00",
                  compareAtPrice: null,
                  availableForSale: false,
                  selectedOptions: [
                    { name: "Color", value: "Azul" },
                    { name: "Size", value: "G" },
                  ],
                  image: null,
                },
              },
            ],
          },
        }),
      ],
      { endCursor: null, hasNextPage: false },
    );

    const pages = [pageOne, pageTwo];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        `https://${shop}/admin/api/2026-04/graphql.json`,
      );
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-Shopify-Access-Token"]).toBe("shpat_stored_token");
      return new Response(JSON.stringify(pages.shift()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      count: 2,
      ok: true,
      pages: 2,
      shop_domain: shop,
      sync_mode: "graphql",
      variants_count: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    );
    expect(secondCallBody.variables).toEqual({ cursor: "cursor-page-1" });

    const products = await prisma.product.findMany({
      where: { store_id: store.id, platform: "shopify" },
      orderBy: { external_id: "asc" },
    });
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({
      external_id: "1001",
      name: "Vestido Midi",
      description: "Um vestido lindo",
      status: "active",
      currency: "BRL",
      product_url: `https://${shop}/products/vestido-midi`,
      image_url: "https://cdn.shopify.test/vestido.jpg",
    });
    expect(Number(products[0].price)).toBe(199.9);
    expect(Number(products[0].compare_at_price)).toBe(249.9);
    expect(products[1]).toMatchObject({
      external_id: "1002",
      status: "draft",
    });

    const variants = await prisma.productVariant.findMany({
      where: { store_id: store.id, platform: "shopify" },
      orderBy: { external_id: "asc" },
    });
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({
      external_id: "2001",
      product_id: products[0].id,
      sku: "VM-M",
      color_name: "Vermelho",
      color_hex: "#FF0000",
      size_name: "M",
      status: "active",
      image_url: "https://cdn.shopify.test/vestido-vermelho.jpg",
    });
    expect(variants[0].metadata).toMatchObject({
      admin_gid: "gid://shopify/ProductVariant/2001",
      available_for_sale: true,
    });
    expect(variants[1]).toMatchObject({
      external_id: "2002",
      color_name: "Azul",
      size_name: "G",
      status: "draft",
    });

    const updatedIntegration = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(updatedIntegration.last_sync_at).not.toBeNull();
    expect(updatedIntegration.settings).toMatchObject({
      last_product_sync_count: 2,
      last_product_sync_mode: "graphql",
      last_product_sync_pages: 2,
      shop_domain: shop,
    });
  });

  it("refreshes an expired OAuth token before syncing and persists it", async () => {
    const shop = "refresh-shop.myshopify.com";
    const { owner, store, integration } = await seedShopifyIntegration({
      shop,
      tokenType: "bearer",
      secretMetadata: {
        access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        refresh_token: "refresh_token_old",
        shop_domain: shop,
      },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/admin/oauth/access_token")) {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        expect(String(init?.body)).toContain("refresh_token=refresh_token_old");
        return new Response(
          JSON.stringify({
            access_token: "shpat_refreshed_token",
            expires_in: 86_400,
            refresh_token: "refresh_token_new",
            refresh_token_expires_in: 2_592_000,
            scope: "read_products",
          }),
          { status: 200 },
        );
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-Shopify-Access-Token"]).toBe("shpat_refreshed_token");
      return new Response(
        JSON.stringify(
          graphqlPage([], { endCursor: null, hasNextPage: false }),
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ count: 0, ok: true, pages: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
    expect(secret.access_token).toBe("shpat_refreshed_token");
    expect(secret.token_type).toBe("bearer");
    expect(secret.metadata).toMatchObject({
      refresh_token: "refresh_token_new",
      expiring_offline: true,
      shop_domain: shop,
    });
    const metadata = secret.metadata as { access_token_expires_at: string };
    expect(
      new Date(metadata.access_token_expires_at).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("returns 502 when the token refresh fails", async () => {
    const shop = "broken-refresh.myshopify.com";
    const { owner, store } = await seedShopifyIntegration({
      shop,
      tokenType: "bearer",
      secretMetadata: {
        access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        refresh_token: "refresh_token_dead",
      },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
          }),
      ),
    );

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      error: "shopify_token_refresh_failed",
      message: "invalid_grant",
    });
  });

  it("returns 502 with the GraphQL error message when the fetch fails", async () => {
    const shop = "graphql-error.myshopify.com";
    const { owner, store } = await seedShopifyIntegration({ shop });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ errors: [{ message: "Throttled" }] }),
            { status: 200 },
          ),
      ),
    );

    const response = await request(app.server)
      .post(ROUTE)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "shopify_products_fetch_failed",
      message: "Throttled",
      sync_mode: "graphql",
    });
  });
});
