import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { createVideo } from "../../../test/utils/create-video";

describe("GET /api/analytics/events (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("filters by window and event types with the full projection", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: store.id, event_type: "video_view", visitor_id: "v1", session_id: "s1" },
        { store_id: store.id, event_type: "product_click" },
        { store_id: store.id, event_type: "feed_open" },
      ],
    });

    const response = await request(app.server)
      .get("/api/analytics/events")
      .query({
        store_id: store.id,
        since: new Date(Date.now() - 60_000).toISOString(),
        event_types: "video_view,product_click",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(2);
    const view = response.body.events.find((e: any) => e.event_type === "video_view");
    expect(view).toMatchObject({ visitor_id: "v1", session_id: "s1" });
    // Full projection excludes row ids.
    expect(view.id).toBeUndefined();
  });

  it("aggregates per-day/per-type counts with the daily_counts preset", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: store.id, event_type: "video_view" },
        { store_id: store.id, event_type: "video_view" },
        { store_id: store.id, event_type: "product_click" },
        { store_id: store.id, event_type: "video_view", created_at: yesterday },
        // Outside the type filter — must not appear.
        { store_id: store.id, event_type: "feed_open" },
      ],
    });

    const response = await request(app.server)
      .get("/api/analytics/events")
      .query({
        store_id: store.id,
        since: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        event_types: "video_view,product_click",
        fields: "daily_counts",
        tz: "UTC",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const buckets = response.body.buckets as {
      day: string;
      event_type: string;
      count: number;
    }[];
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    expect(buckets).toEqual(
      expect.arrayContaining([
        { day: today, event_type: "video_view", count: 2 },
        { day: today, event_type: "product_click", count: 1 },
        { day: yesterdayKey, event_type: "video_view", count: 1 },
      ]),
    );
    expect(buckets.some((bucket) => bucket.event_type === "feed_open")).toBe(false);
    // Ordered by day ascending.
    expect(buckets[0].day <= buckets[buckets.length - 1].day).toBe(true);
  });

  it("returns the feedbacks preset with the video title join", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const video = await createVideo({ storeId: store.id, title: "Avaliado" });
    await prisma.analyticsEvent.create({
      data: {
        store_id: store.id,
        video_id: video.id,
        event_type: "widget_view",
        metadata: { action: "feedback_submit", rating: 5 },
      },
    });

    const response = await request(app.server)
      .get("/api/analytics/events")
      .query({
        store_id: store.id,
        since: new Date(Date.now() - 60_000).toISOString(),
        event_types: "widget_view",
        fields: "feedbacks",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.events[0]).toMatchObject({
      videos: { title: "Avaliado" },
      metadata: { action: "feedback_submit", rating: 5 },
    });
    expect(response.body.events[0].id).toBeDefined();
  });

  it("caps the window at 92 days back", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const old = await prisma.analyticsEvent.create({
      data: { store_id: store.id, event_type: "video_view" },
    });
    await prisma.analyticsEvent.update({
      where: { id: old.id },
      data: { created_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
    });

    const response = await request(app.server)
      .get("/api/analytics/events")
      .query({ store_id: store.id, since: new Date(0).toISOString() })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(0);
  });

  it("rejects non-members with 403", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/analytics/events")
      .query({ store_id: store.id, since: new Date().toISOString() })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
