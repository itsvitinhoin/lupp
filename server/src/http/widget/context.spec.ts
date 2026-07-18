import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";

async function seedContextStore(settings: object = {}) {
  const { store } = await createStore();
  await prisma.widget.create({
    data: {
      store_id: store.id,
      name: "Widget",
      type: "floating_video",
      status: "active",
      settings,
    },
  });
  return store;
}

async function seedVideo(
  storeId: string,
  overrides: {
    title?: string;
    is_feed_enabled?: boolean;
    is_product_page_enabled?: boolean;
    productUrl?: string;
    price?: number;
  } = {},
) {
  const video = await prisma.video.create({
    data: {
      store_id: storeId,
      title: overrides.title ?? "Video",
      status: "active",
      processing_status: "ready",
      is_feed_enabled: overrides.is_feed_enabled ?? true,
      is_product_page_enabled: overrides.is_product_page_enabled ?? true,
      playback_url: "https://cdn.example.com/v/playlist.m3u8",
      thumbnail_url: "https://cdn.example.com/v/thumb.jpg",
    },
  });
  if (overrides.productUrl) {
    const product = await prisma.product.create({
      data: {
        store_id: storeId,
        name: "Produto Vinculado",
        external_id: `ext-${randomUUID()}`,
        platform: "nuvemshop",
        price: overrides.price ?? 149.9,
        currency: "BRL",
        product_url: overrides.productUrl,
      },
    });
    await prisma.videoProduct.create({
      data: { video_id: video.id, product_id: product.id, is_primary: true },
    });
  }
  return video;
}

const contextUrl = (storeId: string, pageUrl: string, widget = "floating_launcher") =>
  `/api/widget/bootstrap?widget=${widget}&store_id=${storeId}&url=${encodeURIComponent(pageUrl)}`;

describe("GET /api/widget/bootstrap context mode (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns slim render-ready cards with resolved config and display", async () => {
    const store = await seedContextStore({
      appearance: { accent_color: "#123456", label: "Assista" },
      display: { exclude_paths: ["/checkout"] },
    });
    await seedVideo(store.id, { title: "Feed video" });

    const response = await request(app.server).get(
      contextUrl(store.id, "https://loja.example.com/"),
    );

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("context");
    expect(response.body.display).toEqual({ show: true, reason: "ok" });
    expect(response.body.config.launcher.accent_color).toBe("#123456");
    expect(response.body.config.launcher.label).toBe("Assista");
    expect(response.body.config.launcher.position).toBe("bottom-left");
    expect(response.body.videos).toHaveLength(1);
    const card = response.body.videos[0];
    expect(card.media_url).toBe("https://cdn.example.com/v/playlist.m3u8");
    expect(card.thumbnail_url).toBe("https://cdn.example.com/v/thumb.jpg");
    expect(card).not.toHaveProperty("video_products");
    expect(response.headers.etag).toMatch(/^"[a-f0-9]{32}"$/);
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("orders product-page matches first and resolves the price label", async () => {
    const store = await seedContextStore();
    await seedVideo(store.id, { title: "Generic feed video" });
    await seedVideo(store.id, {
      title: "Matching product video",
      productUrl: "https://loja.example.com/produtos/tenis-runner",
      price: 199.9,
    });

    const response = await request(app.server).get(
      contextUrl(store.id, "https://loja.example.com/produtos/tenis-runner"),
    );

    expect(response.status).toBe(200);
    expect(response.body.videos).toHaveLength(2);
    expect(response.body.videos[0].title).toBe("Matching product video");
    expect(response.body.videos[0].product.name).toBe("Produto Vinculado");
    expect(response.body.videos[0].product.price_label).toBe(
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(199.9),
    );
  });

  it("hides on excluded paths and returns no video payload", async () => {
    const store = await seedContextStore({ display: { exclude_paths: ["/checkout"] } });
    await seedVideo(store.id);

    const response = await request(app.server).get(
      contextUrl(store.id, "https://loja.example.com/checkout/step-1"),
    );

    expect(response.status).toBe(200);
    expect(response.body.display).toEqual({ show: false, reason: "excluded_path" });
    expect(response.body.videos).toHaveLength(0);
  });

  it("hides on home when home_experience_enabled is false", async () => {
    const store = await seedContextStore({ display: { home_experience_enabled: false } });
    await seedVideo(store.id);

    const home = await request(app.server).get(contextUrl(store.id, "https://loja.example.com/"));
    expect(home.body.display).toEqual({ show: false, reason: "home_experience_disabled" });

    const inner = await request(app.server).get(
      contextUrl(store.id, "https://loja.example.com/colecao"),
    );
    expect(inner.body.display).toEqual({ show: true, reason: "ok" });
  });

  it("answers 304 to a matching If-None-Match revalidation", async () => {
    const store = await seedContextStore();
    await seedVideo(store.id);

    const first = await request(app.server).get(contextUrl(store.id, "https://loja.example.com/"));
    const revalidated = await request(app.server)
      .get(contextUrl(store.id, "https://loja.example.com/"))
      .set("if-none-match", first.headers.etag);

    expect(revalidated.status).toBe(304);
    expect(revalidated.body).toEqual({});
  });

  it("keeps the legacy full payload when no url is sent", async () => {
    const store = await seedContextStore();
    await seedVideo(store.id, {
      productUrl: "https://loja.example.com/produtos/tenis-runner",
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?widget=floating_launcher&mode=preview&store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("preview");
    expect(response.body.display).toBeUndefined();
    expect(response.body.config).toBeUndefined();
    expect(response.body.videos[0].video_products[0].products.product_variants).toBeDefined();
  });
});
