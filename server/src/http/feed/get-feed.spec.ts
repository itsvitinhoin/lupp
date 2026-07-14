import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/feed (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await request(app.server)
      .get("/api/feed")
      .query({ store_slug: "inexistente" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "store_not_found" });
  });

  it("requires a store identifier", async () => {
    const response = await request(app.server).get("/api/feed");
    expect(response.status).toBe(400);
  });

  it("answers active:false when billing access is lost", async () => {
    const { store } = await createStore({
      trial_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const response = await request(app.server)
      .get("/api/feed")
      .query({ store_slug: store.slug });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ active: false, error: "trial_expired", videos: [] });
  });

  it("returns only ready feed-enabled videos, featured first, with metrics", async () => {
    const { store } = await createStore();
    const featured = await createVideo({
      storeId: store.id,
      title: "Destaque",
      is_featured: true,
      sort_order: 5,
    });
    const normal = await createVideo({ storeId: store.id, title: "Normal", sort_order: 1 });
    await createVideo({ storeId: store.id, title: "Fora do Feed", is_feed_enabled: false });
    await createVideo({ storeId: store.id, title: "Processando", processing_status: "processing" });
    await createVideo({ storeId: store.id, title: "Pausado", status: "paused" });
    await prisma.videoLike.create({
      data: { store_id: store.id, video_id: normal.id, visitor_id: "v-1" },
    });

    const response = await request(app.server)
      .get("/api/feed")
      .query({ store_slug: store.slug });

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(true);
    expect(response.body.videos.map((v: any) => v.id)).toEqual([featured.id, normal.id]);
    const normalRow = response.body.videos.find((v: any) => v.id === normal.id);
    expect(normalRow.likes).toBe(1);
    expect(normalRow.metrics).toMatchObject({ likes: 1, views: 0 });
    expect(response.body.store.id).toBe(store.id);
    expect(response.body.store.widget_settings).toBeDefined();
  });

  it("orders by created_at when the widget says automatic", async () => {
    const { store } = await createStore();
    await prisma.widget.create({
      data: {
        store_id: store.id,
        name: "Floating",
        type: "floating_video",
        status: "active",
        settings: { display: { home_ordering: "automatic" } },
      },
    });
    const older = await createVideo({
      storeId: store.id,
      title: "Antigo",
      sort_order: 0,
      created_at: new Date(Date.now() - 60_000),
    });
    const newer = await createVideo({ storeId: store.id, title: "Recente", sort_order: 9 });

    const response = await request(app.server)
      .get("/api/feed")
      .query({ store_id: store.id });

    expect(response.body.videos.map((v: any) => v.id)).toEqual([newer.id, older.id]);
  });

  it("pins the contextual video and product-matched videos ahead of the feed", async () => {
    const { store } = await createStore();
    const product = await prisma.product.create({
      data: {
        store_id: store.id,
        name: "Tênis",
        product_url: "https://loja.example.com/produtos/tenis-run",
      },
    });
    const feedVideo = await createVideo({ storeId: store.id, title: "Feed", sort_order: 0 });
    const productVideo = await createVideo({
      storeId: store.id,
      title: "Do Produto",
      is_feed_enabled: false,
      productIds: [product.id],
    });

    const response = await request(app.server).get("/api/feed").query({
      store_slug: store.slug,
      product_url: "https://loja.example.com/produtos/tenis-run",
    });

    expect(response.status).toBe(200);
    expect(response.body.videos.map((v: any) => v.id)).toEqual([productVideo.id, feedVideo.id]);

    const withInclude = await request(app.server).get("/api/feed").query({
      store_slug: store.slug,
      include_video_id: productVideo.id,
    });
    expect(withInclude.body.videos.map((v: any) => v.id)).toEqual([
      productVideo.id,
      feedVideo.id,
    ]);
  });
});
