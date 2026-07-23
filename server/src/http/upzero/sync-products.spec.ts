import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";
import { Prisma } from "../../../generated/prisma/client";
import { UpzeroRoutes } from "./routes";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const STOREFRONT_SETTINGS = {
  base_url: "https://api.upzero.com.br",
  connected_via: "api_key",
  integration_name: null,
  last_connection_source: "storefront",
  product_url_pattern: "/produtos/{code}-{name_slug}",
  storefront_url: "https://loja.example.com",
};

async function seedIntegration(
  storeId: string,
  settings: Record<string, unknown> = STOREFRONT_SETTINGS,
  options: { withSecret?: boolean } = {},
) {
  const integration = await prisma.integration.create({
    data: {
      store_id: storeId,
      provider: "upzero",
      status: "active",
      credentials: {},
      settings: settings as Prisma.InputJsonValue,
      external_store_id: `upzero:${storeId}`,
      connected_at: new Date(),
    },
  });

  if (options.withSecret !== false) {
    await prisma.integrationSecret.create({
      data: {
        integration_id: integration.id,
        provider: "upzero",
        external_store_id: `upzero:${storeId}`,
        access_token: "upzero-key-123",
        token_type: "api_key",
        scope: "storefront:products external:products",
      },
    });
  }

  return integration;
}

const storefrontVariant5001 = {
  attribute_values: [
    {
      attribute_code: "color",
      value_name: "Azul",
      value_code: "azul",
      value_meta: { hex: "#0000ff" },
    },
    { attribute_code: "size", value_name: "M", value_code: "m" },
  ],
  images: ["/images/blue-m.jpg"],
  variant: {
    id: 5001,
    sku: "REF123-AZUL-M",
    active: true,
    stock_qty: 3,
    asset_id: 77,
    price_cents: 19900,
    promo_cents: 14900,
  },
};

const storefrontVariant5002 = {
  attribute_values: [
    { attribute_code: "color", value_name: "Azul", value_code: "azul" },
    { attribute_code: "size", value_name: "G", value_code: "g" },
  ],
  variant: {
    id: 5002,
    sku: "REF123-AZUL-G",
    active: false,
    stock_qty: 0,
    price_cents: 19900,
  },
};

function storefrontPayload(variants: unknown[]) {
  return {
    items: [
      {
        product: {
          id: 101,
          code: "REF123",
          name: "Vestido Azul",
          description: "Um vestido",
          slug: null,
          card_data: {
            cover_image_url: "/images/cover.jpg",
            price_cents: 19900,
            promo_cents: 14900,
          },
        },
        variants,
      },
    ],
  };
}

function mockStorefrontApi(payload: unknown) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v1/product-images") || url.includes("/v1/product/data/")) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (url.includes("/v1/products")) return jsonResponse(payload);
    return jsonResponse({}, 404);
  });
}

describe("POST /api/integrations/upzero/sync-products (e2e)", () => {
  beforeAll(async () => {
    // The orchestrator wires UpzeroRoutes into src/routes.ts; register locally
    // only while that aggregation has not happened yet.
    const routesSource = readFileSync(
      new URL("../../routes.ts", import.meta.url),
      "utf8",
    );
    if (!routesSource.includes("UpzeroRoutes")) {
      await app.register(UpzeroRoutes);
    }
    await app.ready();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .send({ store_id: "any" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
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
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 400 when the store has no active Upzero integration", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "upzero_not_connected" });
  });

  it("returns 400 when the integration has no stored API key", async () => {
    const { owner, store } = await createStore();
    await seedIntegration(store.id, STOREFRONT_SETTINGS, { withSecret: false });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_upzero_api_key" });
  });

  it("syncs the storefront catalog, upserting products and variants, then archives stale variants on re-sync", async () => {
    const { owner, store } = await createStore();
    const integration = await seedIntegration(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    mockStorefrontApi(storefrontPayload([storefrontVariant5001, storefrontVariant5002]));

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      count: 1,
      inserted: 1,
      updated: 0,
      pages: 1,
      source: "storefront",
      variants: 2,
      images_found: 1,
      variants_with_attributes: 2,
    });

    const [listUrl, listInit] = fetchMock.mock.calls[0];
    expect(String(listUrl)).toContain("/v1/products?page=1&limit=100&include_variants=true");
    expect(listInit.headers["X-API-Key"]).toBe("upzero-key-123");

    const product = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "101",
        },
      },
    });
    expect(product.name).toBe("Vestido Azul");
    expect(product.description).toBe("Um vestido");
    expect(Number(product.price)).toBe(149);
    expect(Number(product.compare_at_price)).toBe(199);
    expect(product.currency).toBe("BRL");
    expect(product.image_url).toBe("https://loja.example.com/images/cover.jpg");
    expect(product.product_url).toBe(
      "https://loja.example.com/produtos/ref123-vestido-azul",
    );
    expect(product.status).toBe("active");

    const variants = await prisma.productVariant.findMany({
      where: { store_id: store.id, product_id: product.id },
      orderBy: { external_id: "asc" },
    });
    expect(variants).toHaveLength(2);

    const [variantM, variantG] = variants;
    expect(variantM.external_id).toBe("5001");
    expect(variantM.sku).toBe("REF123-AZUL-M");
    expect(variantM.color_name).toBe("Azul");
    expect(variantM.color_code).toBe("azul");
    expect(variantM.color_hex).toBe("#0000ff");
    expect(variantM.size_name).toBe("M");
    expect(variantM.size_code).toBe("m");
    expect(Number(variantM.price)).toBe(149);
    expect(Number(variantM.compare_at_price)).toBe(199);
    expect(variantM.stock_qty).toBe(3);
    expect(variantM.asset_id).toBe("77");
    expect(variantM.status).toBe("active");
    expect(variantM.image_url).toBe("https://loja.example.com/images/blue-m.jpg");
    expect(variantM.metadata).toMatchObject({ image_key: null });

    expect(variantG.external_id).toBe("5002");
    expect(variantG.status).toBe("draft");
    expect(variantG.stock_qty).toBe(0);
    expect(Number(variantG.price)).toBe(199);
    expect(variantG.compare_at_price).toBeNull();
    expect(variantG.size_name).toBe("G");
    // No variant image: falls back to the product cover.
    expect(variantG.image_url).toBe("https://loja.example.com/images/cover.jpg");

    const updatedIntegration = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(updatedIntegration.last_sync_at).not.toBeNull();
    expect(updatedIntegration.settings).toMatchObject({
      last_product_sync_count: 1,
      last_product_sync_inserted: 1,
      last_product_sync_source: "storefront",
      last_product_sync_variants: 2,
    });

    // Re-sync with variant 5002 gone: the product is updated (not duplicated)
    // and the missing variant is archived with zero stock.
    mockStorefrontApi(storefrontPayload([storefrontVariant5001]));

    const resync = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(resync.status).toBe(200);
    expect(resync.body).toMatchObject({
      count: 1,
      inserted: 0,
      updated: 1,
      variants: 1,
    });

    const productsAfter = await prisma.product.findMany({
      where: { store_id: store.id, platform: "upzero" },
    });
    expect(productsAfter).toHaveLength(1);

    const staleVariant = await prisma.productVariant.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "5002",
        },
      },
    });
    expect(staleVariant.status).toBe("archived");
    expect(staleVariant.stock_qty).toBe(0);

    const keptVariant = await prisma.productVariant.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "5001",
        },
      },
    });
    expect(keptVariant.status).toBe("active");
    expect(keptVariant.stock_qty).toBe(3);
  });

  it("does not invent a 'ref' prefix for a bare numeric product id, and adds the discovered storefront-id path prefix on a later sync", async () => {
    const { owner, store } = await createStore();
    const integration = await seedIntegration(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    function bareNumericPayload() {
      return {
        items: [
          {
            product: {
              id: 27082,
              code: null,
              name: "VT Linho Gerlane",
              slug: null,
              card_data: { cover_image_url: "/img.jpg", price_cents: 40999 },
            },
            variants: [],
          },
        ],
      };
    }

    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v1/product-images") || url.includes("/v1/product/data/")) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      if (url.includes("/v1/products")) return jsonResponse(bareNumericPayload());
      return jsonResponse({}, 404);
    });

    await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    const productAfterFirstSync = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "27082",
        },
      },
    });
    // No "ref" invented for a bare numeric id, and no storefront-id prefix
    // yet — nothing to discover it from on a store's very first sync.
    expect(productAfterFirstSync.product_url).toBe(
      "https://loja.example.com/produtos/27082-vt-linho-gerlane",
    );

    // On the next sync, discovery fetches that just-synced product's own
    // page and finds the storefront's numeric id embedded in it.
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === "https://loja.example.com/produtos/27082-vt-linho-gerlane") {
        return new Response(
          '<script id="__NEXT_DATA__">{"props":{"store":{"id":40}}}</script>',
          { status: 200 },
        );
      }
      if (url.includes("/v1/product-images") || url.includes("/v1/product/data/")) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      if (url.includes("/v1/products")) return jsonResponse(bareNumericPayload());
      return jsonResponse({}, 404);
    });

    const resync = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(resync.status).toBe(200);

    const productAfterResync = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "27082",
        },
      },
    });
    expect(productAfterResync.product_url).toBe(
      "https://loja.example.com/40/produtos/27082-vt-linho-gerlane",
    );

    const updatedIntegration = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(updatedIntegration.settings).toMatchObject({ storefront_store_id: 40 });
  });

  it("prunes a product Upzero stopped returning, re-linking any video to its same-named replacement first", async () => {
    const { owner, store } = await createStore();
    await seedIntegration(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    mockStorefrontApi(storefrontPayload([storefrontVariant5001]));

    await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    const staleProduct = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "101",
        },
      },
    });

    const video = await createVideo({ storeId: store.id, productIds: [staleProduct.id] });

    // Upzero now serves the exact same catalog item — same name — under a
    // new product id (202); the old id (101) no longer appears at all.
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v1/product-images") || url.includes("/v1/product/data/")) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      if (url.includes("/v1/products")) {
        return jsonResponse({
          items: [
            {
              product: {
                id: 202,
                code: "REF123",
                name: "Vestido Azul",
                description: "Um vestido",
                slug: null,
                card_data: { cover_image_url: "/images/cover.jpg", price_cents: 19900 },
              },
              variants: [storefrontVariant5001],
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      catalog_fully_fetched: true,
      pruned: 1,
      relinked_videos: 1,
    });

    const freshProduct = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "202",
        },
      },
    });

    await expect(
      prisma.product.findUnique({ where: { id: staleProduct.id } }),
    ).resolves.toBeNull();

    const videoProducts = await prisma.videoProduct.findMany({
      where: { video_id: video.id },
    });
    expect(videoProducts).toHaveLength(1);
    expect(videoProducts[0].product_id).toBe(freshProduct.id);
    expect(videoProducts[0].is_primary).toBe(true);
  });

  it("syncs via the external endpoint when it was the last successful connection source", async () => {
    const { owner, store } = await createStore();
    await seedIntegration(store.id, {
      ...STOREFRONT_SETTINGS,
      storefront_url: "https://loja2.example.com",
      last_connection_source: "external",
      integration_name: "minha-loja",
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/external/v1/products")) {
        return jsonResponse({
          data: [
            {
              id: "abc",
              code: "REF9",
              name: "Camisa",
              description_html: "<p>x</p>",
              status: "active",
              images: [{ url: "https://cdn.example.com/img.jpg" }],
              variants: [
                {
                  id: 900,
                  sku: "REF9-P",
                  active: true,
                  price: "99,90",
                  promotional_price: "79,90",
                  stock_qty: 5,
                  attributes: [{ attribute_code: "size", value_name: "P", value_code: "p" }],
                },
              ],
            },
          ],
          next_cursor: null,
        });
      }
      return jsonResponse({}, 404);
    });

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      count: 1,
      inserted: 1,
      source: "external",
      variants: 1,
    });

    // Goes straight to the external endpoint, tagged with the partner name.
    const [externalUrl] = fetchMock.mock.calls[0];
    expect(String(externalUrl)).toBe(
      "https://api.upzero.com.br/external/v1/products?limit=100&integration=minha-loja",
    );

    const product = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "abc",
        },
      },
    });
    expect(product.name).toBe("Camisa");
    expect(product.description).toBe("<p>x</p>");
    expect(Number(product.price)).toBe(79.9);
    expect(Number(product.compare_at_price)).toBe(99.9);
    expect(product.image_url).toBe("https://cdn.example.com/img.jpg");
    expect(product.product_url).toBe("https://loja2.example.com/produtos/ref9-camisa");

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "upzero",
          external_id: "900",
        },
      },
    });
    expect(variant.product_id).toBe(product.id);
    expect(variant.sku).toBe("REF9-P");
    expect(variant.size_name).toBe("P");
    expect(variant.size_code).toBe("p");
    expect(variant.color_name).toBeNull();
    expect(Number(variant.price)).toBe(79.9);
    expect(Number(variant.compare_at_price)).toBe(99.9);
    expect(variant.stock_qty).toBe(5);
    expect(variant.status).toBe("active");
  });

  it("surfaces a storefront sync failure with the upstream attempts", async () => {
    const { owner, store } = await createStore();
    await seedIntegration(store.id);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "invalid api key" }, 401),
    );

    const response = await request(app.server)
      .post("/api/integrations/upzero/sync-products")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("upzero_storefront_product_sync_failed");
    expect(response.body.attempts).toHaveLength(2);
    expect(response.body.attempts[0].source).toBe("storefront_include_variants");
    expect(response.body.attempts[1].source).toBe("storefront_card_mode");
  });
});
