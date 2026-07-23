import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { WidgetRoutes } from "./routes";

// The orchestrator wires WidgetRoutes into src/routes.ts; until then the spec
// registers the domain itself (guarded so wiring doesn't duplicate routes).
const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "WidgetRoutes",
);

async function seedWidget(
  storeId: string,
  overrides: { type?: "floating_video" | "product_video"; settings?: object } = {},
) {
  return prisma.widget.create({
    data: {
      store_id: storeId,
      name: "Widget",
      type: overrides.type ?? "floating_video",
      status: "active",
      settings: overrides.settings ?? { carousel: { enabled: true }, display: { size: "md" } },
    },
  });
}

async function seedVideoTree(storeId: string) {
  const product = await prisma.product.create({
    data: {
      store_id: storeId,
      name: "Produto Teste",
      description: "desc",
      external_id: `ext-${randomUUID()}`,
      platform: "nuvemshop",
      price: 129.9,
      compare_at_price: 199.9,
      currency: "BRL",
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      store_id: storeId,
      product_id: product.id,
      platform: "nuvemshop",
      external_id: `var-${randomUUID()}`,
      sku: "SKU-1",
      color_name: "Azul",
      price: 119.9,
      stock_qty: 3,
      metadata: { origem: "sync" },
    },
  });
  const video = await prisma.video.create({
    data: {
      store_id: storeId,
      title: "Video 1",
      status: "active",
      processing_status: "ready",
      provider: "bunny",
      file_size: 12_345_678n,
      playback_url: "https://cdn.example.com/v/playlist.m3u8",
    },
  });
  await prisma.videoProduct.create({
    data: { video_id: video.id, product_id: product.id, is_primary: true },
  });
  return { product, variant, video };
}

describe("GET /api/widget/bootstrap (e2e)", () => {
  beforeAll(async () => {
    if (!routesWired) await app.register(WidgetRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 404 with the tried[] resolution list when nothing matches", async () => {
    const response = await request(app.server).get(
      "/api/widget/bootstrap?store_slug=missing&store_domain=nowhere.example.com",
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      active: false,
      error: "store_not_found",
      tried: ["store_slug", "store_domain", "integration_domain"],
    });
  });

  it("does not resolve a paused store and records every tried identifier", async () => {
    const { store } = await createStore({ status: "paused" });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}&store_slug=${store.slug}`,
    );

    expect(response.status).toBe(404);
    expect(response.body.tried).toEqual(["store_id", "store_slug"]);
  });

  it("resolves by store_id and returns the active widget", async () => {
    const { store } = await createStore();
    await seedWidget(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(true);
    expect(response.body.error).toBeUndefined();
    expect(response.body.mode).toBe("feed");
    expect(response.body.resolved_by).toBe("store_id");
    expect(response.body.store).toEqual({
      id: store.id,
      slug: store.slug,
      button_color: store.button_color,
      status: "active",
      platform: null,
      url: null,
      plan_id: store.plan_id,
    });
    expect(response.body.widget.type).toBe("floating_video");
  });

  it("resolves by external_store_id through the integration (with provider hint)", async () => {
    const { store } = await createStore();
    await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "nuvemshop",
        status: "active",
        external_store_id: "998877",
      },
    });
    await seedWidget(store.id);

    const response = await request(app.server).get(
      "/api/widget/bootstrap?external_store_id=998877&provider=nuvemshop",
    );

    expect(response.status).toBe(200);
    expect(response.body.resolved_by).toBe("external_store_id");
    expect(response.body.store.id).toBe(store.id);
  });

  it("falls through a stale store_id to the slug (lupp_store alias)", async () => {
    const { store } = await createStore();
    await seedWidget(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${randomUUID()}&lupp_store=${store.slug}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.resolved_by).toBe("store_slug");
    expect(response.body.store.id).toBe(store.id);
  });

  it("resolves by domain against stores.url and integrations.settings domains", async () => {
    const { store } = await createStore();
    await prisma.store.update({
      where: { id: store.id },
      data: { url: "https://www.minhaloja.com.br/loja" },
    });
    await seedWidget(store.id);

    const byUrl = await request(app.server).get(
      "/api/widget/bootstrap?store_domain=minhaloja.com.br",
    );
    expect(byUrl.status).toBe(200);
    expect(byUrl.body.resolved_by).toBe("store_domain");
    expect(byUrl.body.store.id).toBe(store.id);

    const { store: other } = await createStore();
    await prisma.integration.create({
      data: {
        store_id: other.id,
        provider: "nuvemshop",
        status: "active",
        external_store_id: "112233",
        settings: { nuvemshop_domains: ["outra.lojavirtualnuvem.com.br"] },
      },
    });
    await seedWidget(other.id);

    const byIntegration = await request(app.server).get(
      "/api/widget/bootstrap?hostname=outra.lojavirtualnuvem.com.br",
    );
    expect(byIntegration.status).toBe(200);
    expect(byIntegration.body.resolved_by).toBe("integration_domain");
    expect(byIntegration.body.store.id).toBe(other.id);
  });

  it("gates a store without billing access (expired trial) with active:false", async () => {
    const { store } = await createStore({
      trial_ends_at: new Date(Date.now() - 60_000),
    });
    await seedWidget(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    // The original replied 200 with active:false — the embed script switches
    // on `active`, not the status code.
    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
    expect(response.body.error).toBe("trial_expired");
    expect(response.body.resolved_by).toBe("store_id");
    expect(response.body.videos).toEqual([]);
    expect(response.body.widget).toBeNull();
  });

  it("disables the carousel for plans without the horizontal feed (start)", async () => {
    const { store } = await createStore({ plan_id: "start" });
    await seedWidget(store.id, {
      settings: { carousel: { enabled: true, autoplay: true }, display: { size: "md" } },
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.widget.settings.carousel).toEqual({
      autoplay: true,
      disabled_reason: "plan_widget_limit",
      enabled: false,
    });
    expect(response.body.widget.settings.display).toEqual({ size: "md" });
  });

  it("keeps the carousel untouched for growth/pro/scale plans", async () => {
    const { store } = await createStore({ plan_id: "growth" });
    await seedWidget(store.id, {
      settings: { carousel: { enabled: true, autoplay: true } },
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.widget.settings.carousel).toEqual({ enabled: true, autoplay: true });
  });

  it("maps legacy carousel widget aliases to floating_video", async () => {
    const { store } = await createStore({ plan_id: "growth" });
    await seedWidget(store.id, { type: "floating_video" });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}&widget=horizontal_feed`,
    );

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(true);
    expect(response.body.widget.type).toBe("floating_video");
  });

  it("defaults feed_options to both toggles on when nothing is configured", async () => {
    const { store } = await createStore();
    await seedWidget(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.feed_options).toEqual({
      reload_storefront_on_cart_update: true,
      show_feedback_form_on_close: true,
      overlay_backdrop_color: "#000000",
      overlay_backdrop_opacity: 76,
      close_button_color: "#ffffff",
    });
  });

  it("threads explicit feed_options through the bootstrap response", async () => {
    const { store } = await createStore();
    await seedWidget(store.id, {
      settings: {
        feed_options: {
          reload_storefront_on_cart_update: false,
          show_feedback_form_on_close: false,
          overlay_backdrop_color: "#1a1a2e",
          overlay_backdrop_opacity: 90,
          close_button_color: "#f5f5f5",
        },
      },
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.feed_options).toEqual({
      reload_storefront_on_cart_update: false,
      show_feedback_form_on_close: false,
      overlay_backdrop_color: "#1a1a2e",
      overlay_backdrop_opacity: 90,
      close_button_color: "#f5f5f5",
    });
  });

  it("still finds feed_options on the floating_video row when a different widget type is requested", async () => {
    const { store } = await createStore({ plan_id: "growth" });
    await seedWidget(store.id, {
      type: "floating_video",
      settings: { feed_options: { reload_storefront_on_cart_update: false } },
    });
    await prisma.widget.create({
      data: {
        store_id: store.id,
        name: "Product video widget",
        type: "product_video",
        status: "active",
        settings: {},
      },
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}&widget=product_video`,
    );

    expect(response.status).toBe(200);
    expect(response.body.widget.type).toBe("product_video");
    expect(response.body.feed_options).toEqual({
      reload_storefront_on_cart_update: false,
      show_feedback_form_on_close: true,
      overlay_backdrop_color: "#000000",
      overlay_backdrop_opacity: 76,
      close_button_color: "#ffffff",
    });
  });

  it("answers active:false + no_active_widget when the store has no widget", async () => {
    const { store } = await createStore();

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
    expect(response.body.error).toBe("no_active_widget");
    expect(response.body.widget).toBeNull();
  });

  it("returns the nested videos → video_products → products → product_variants tree", async () => {
    const { store } = await createStore({ plan_id: "growth" });
    await seedWidget(store.id);
    const { product, variant, video } = await seedVideoTree(store.id);
    // Not eligible for the feed: draft video and one hidden from both surfaces.
    await prisma.video.create({
      data: { store_id: store.id, title: "Draft", status: "draft" },
    });
    await prisma.video.create({
      data: {
        store_id: store.id,
        title: "Hidden",
        status: "active",
        processing_status: "ready",
        is_feed_enabled: false,
        is_product_page_enabled: false,
      },
    });

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.videos).toHaveLength(1);

    const feedVideo = response.body.videos[0];
    expect(feedVideo.id).toBe(video.id);
    expect(feedVideo.title).toBe("Video 1");
    // BigInt file_size must come through as a JSON number.
    expect(feedVideo.file_size).toBe(12_345_678);
    expect(feedVideo.video_products).toHaveLength(1);
    expect(feedVideo.video_products[0].is_primary).toBe(true);

    const feedProduct = feedVideo.video_products[0].products;
    expect(feedProduct.id).toBe(product.id);
    expect(feedProduct.name).toBe("Produto Teste");
    expect(feedProduct.price).toBe(129.9);
    expect(feedProduct.compare_at_price).toBe(199.9);

    expect(feedProduct.product_variants).toHaveLength(1);
    const feedVariant = feedProduct.product_variants[0];
    expect(feedVariant.id).toBe(variant.id);
    expect(feedVariant.sku).toBe("SKU-1");
    expect(feedVariant.color_name).toBe("Azul");
    expect(feedVariant.price).toBe(119.9);
    expect(feedVariant.compare_at_price).toBeNull();
    expect(feedVariant.stock_qty).toBe(3);
    expect(feedVariant.metadata).toEqual({ origem: "sync" });
  });

  it("mode=preview returns the reduced video field selection", async () => {
    const { store } = await createStore({ plan_id: "growth" });
    await seedWidget(store.id);
    await seedVideoTree(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}&mode=preview`,
    );

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("preview");
    expect(response.body.videos).toHaveLength(1);

    const video = response.body.videos[0];
    expect(video.title).toBe("Video 1");
    expect(video.playback_url).toBe("https://cdn.example.com/v/playlist.m3u8");
    // Fields outside the preview selection are absent.
    expect(video.file_size).toBeUndefined();
    expect(video.description).toBeUndefined();
    expect(video.video_products[0].products.name).toBe("Produto Teste");
    expect(video.video_products[0].products.product_variants).toHaveLength(1);
  });

  it("mode=meta skips the videos query entirely", async () => {
    const { store } = await createStore();
    await seedWidget(store.id);
    await seedVideoTree(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}&mode=meta`,
    );

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("meta");
    expect(response.body.videos).toEqual([]);
    expect(response.body.active).toBe(true);
  });

  it("builds upzero_config from the integration settings for upzero stores", async () => {
    const { store } = await createStore();
    await prisma.store.update({
      where: { id: store.id },
      data: { platform: "upzero", url: "https://loja.upzero.com.br" },
    });
    await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "upzero",
        status: "active",
        external_store_id: "552",
        settings: {
          base_url: "https://api.upzero.com.br",
          integration_name: "lupp",
          storefront_store_id: 552,
        },
      },
    });
    await seedWidget(store.id);

    const response = await request(app.server).get(
      `/api/widget/bootstrap?store_id=${store.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.upzero_config).toEqual({
      base_url: "https://api.upzero.com.br",
      cart_action_ids: [],
      external_store_id: "552",
      integration_name: "lupp",
      last_connection_source: null,
      product_url_pattern: null,
      storefront_store_id: 552,
      storefront_url: "https://loja.upzero.com.br",
    });
  });
});
