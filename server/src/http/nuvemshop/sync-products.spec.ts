import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const SYNC_PATH = "/api/integrations/nuvemshop/sync-products";

function apiBase(externalStoreId: string) {
  return `https://api.nuvemshop.com.br/2025-03/${externalStoreId}`;
}

const NUVEMSHOP_PRODUCTS = [
  {
    id: 111,
    name: { pt: "Camiseta Azul" },
    description: { pt: "<p>Uma  camiseta</p>" },
    handle: { pt: "camiseta-azul" },
    published: true,
    attributes: [{ pt: "Cor" }, { pt: "Tamanho" }],
    images: [{ id: 1, src: "https://img.example.com/camiseta.jpg" }],
    variants: [
      {
        id: 1111,
        price: "100.00",
        promotional_price: "80.00",
        compare_at_price: null,
        values: [{ pt: "Azul" }, { pt: "M" }],
        sku: "CAM-AZ-M",
        stock: "5",
        stock_management: true,
        image_id: 1,
      },
      {
        id: 1112,
        price: "100.00",
        values: [{ pt: "Preto" }, { pt: "G" }],
        stock_management: false,
      },
    ],
  },
  {
    id: 222,
    name: { es: "Zapato" },
    published: false,
    variants: [{ id: 2221, price: 50 }],
  },
];

async function seedConnectedStore(externalStoreId: string) {
  const { owner, store } = await createStore();
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "nuvemshop",
      status: "active",
      external_store_id: externalStoreId,
      settings: { app_id: "36726" },
    },
  });
  await prisma.integrationSecret.create({
    data: {
      integration_id: integration.id,
      provider: "nuvemshop",
      external_store_id: externalStoreId,
      access_token: "shop-token",
      token_type: "bearer",
    },
  });
  return { owner, store, integration };
}

function stubCatalogFetch(externalStoreId: string) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === `${apiBase(externalStoreId)}/store`) {
      return new Response(
        JSON.stringify({ domains: ["https://loja.example.com/"], original_domain: "orig.example.com" }),
        { status: 200 },
      );
    }
    if (url.startsWith(`${apiBase(externalStoreId)}/products`)) {
      // No Link header -> single page.
      return new Response(JSON.stringify(NUVEMSHOP_PRODUCTS), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("POST /api/integrations/nuvemshop/sync-products (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).post(SYNC_PATH).send({ store_id: "any" });
    expect(response.status).toBe(401);
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns nuvemshop_not_connected when there is no active integration", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "nuvemshop_not_connected" });
  });

  it("returns 502 when the products fetch fails", async () => {
    const { owner, store } = await seedConnectedStore("424001");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === `${apiBase("424001")}/store`) return new Response("{}", { status: 200 });
        return new Response("rate limited", { status: 429 });
      }),
    );

    const response = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      error: "nuvemshop_products_fetch_failed",
      status: 429,
      details: "rate limited",
    });
  });

  it("syncs products + variants (normalized) and updates the integration settings", async () => {
    const { owner, store, integration } = await seedConnectedStore("424002");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubCatalogFetch("424002");

    const response = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      count: 2,
      ok: true,
      pages: 1,
      storefront_domain: "loja.example.com",
      variants_count: 3,
    });

    const camiseta = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "nuvemshop",
          external_id: "111",
        },
      },
      include: { variants: { orderBy: { external_id: "asc" } } },
    });
    expect(camiseta.name).toBe("Camiseta Azul");
    expect(camiseta.description).toBe("Uma camiseta");
    expect(Number(camiseta.price)).toBe(80);
    expect(Number(camiseta.compare_at_price)).toBe(100);
    expect(camiseta.image_url).toBe("https://img.example.com/camiseta.jpg");
    expect(camiseta.product_url).toBe("https://loja.example.com/produtos/camiseta-azul/");
    expect(camiseta.status).toBe("active");

    expect(camiseta.variants).toHaveLength(2);
    const [first, second] = camiseta.variants;
    expect(first.external_id).toBe("1111");
    expect(first.color_name).toBe("Azul");
    expect(first.color_hex).toBe("#0000DC");
    expect(first.size_name).toBe("M");
    expect(first.sku).toBe("CAM-AZ-M");
    expect(first.stock_qty).toBe(5);
    expect(Number(first.price)).toBe(80);
    expect(Number(first.compare_at_price)).toBe(100);
    expect(first.image_url).toBe("https://img.example.com/camiseta.jpg");
    // stock_management=false -> stock not tracked.
    expect(second.stock_qty).toBeNull();
    expect(second.size_name).toBe("G");

    const zapato = await prisma.product.findUniqueOrThrow({
      where: {
        store_id_platform_external_id: {
          store_id: store.id,
          platform: "nuvemshop",
          external_id: "222",
        },
      },
      include: { variants: true },
    });
    expect(zapato.name).toBe("Zapato");
    expect(zapato.status).toBe("draft");
    expect(zapato.product_url).toBeNull();
    expect(zapato.variants[0].size_name).toBe("Unico");
    expect(zapato.variants[0].status).toBe("draft");

    const updatedIntegration = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(updatedIntegration.last_sync_at).not.toBeNull();
    expect(updatedIntegration.settings).toMatchObject({
      app_id: "36726",
      last_product_sync_count: 2,
      last_product_sync_pages: 1,
      nuvemshop_domains: ["https://loja.example.com/"],
      nuvemshop_original_domain: "orig.example.com",
      storefront_domain: "loja.example.com",
    });
  });

  it("upserts on re-sync instead of duplicating products", async () => {
    const { owner, store } = await seedConnectedStore("424003");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    stubCatalogFetch("424003");

    const first = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });
    expect(first.status).toBe(200);

    const second = await request(app.server)
      .post(SYNC_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });
    expect(second.status).toBe(200);

    const productCount = await prisma.product.count({ where: { store_id: store.id } });
    const variantCount = await prisma.productVariant.count({ where: { store_id: store.id } });
    expect(productCount).toBe(2);
    expect(variantCount).toBe(3);
  });
});
