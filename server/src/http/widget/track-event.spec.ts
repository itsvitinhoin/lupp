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

describe("POST /api/widget/events (e2e)", () => {
  beforeAll(async () => {
    if (!routesWired) await app.register(WidgetRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a missing store_id or event_type with missing_event_data", async () => {
    const { store } = await createStore();

    const noStore = await request(app.server)
      .post("/api/widget/events")
      .send({ event_type: "video_view" });
    expect(noStore.status).toBe(400);
    expect(noStore.body).toEqual({ error: "missing_event_data" });

    const noType = await request(app.server)
      .post("/api/widget/events")
      .send({ store_id: store.id });
    expect(noType.status).toBe(400);
    expect(noType.body).toEqual({ error: "missing_event_data" });
  });

  it("rejects an event_type outside the allowed set without inserting", async () => {
    const { store } = await createStore();

    const response = await request(app.server)
      .post("/api/widget/events")
      .send({ store_id: store.id, event_type: "totally_made_up" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "analytics_insert_failed" });

    const count = await prisma.analyticsEvent.count({ where: { store_id: store.id } });
    expect(count).toBe(0);
  });

  it("fails with analytics_insert_failed for an unknown store", async () => {
    const response = await request(app.server)
      .post("/api/widget/events")
      .send({ store_id: randomUUID(), event_type: "video_view" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "analytics_insert_failed" });
  });

  it("inserts the analytics event with metadata and context fields (public, no auth)", async () => {
    const { store } = await createStore();
    const video = await prisma.video.create({
      data: { store_id: store.id, title: "Video", status: "active" },
    });

    const response = await request(app.server).post("/api/widget/events").send({
      store_id: store.id,
      event_type: "video_view",
      video_id: video.id,
      session_id: "sess-1",
      visitor_id: "visitor-1",
      url: "https://loja.example.com/produto",
      referrer: "https://google.com",
      user_agent: "Mozilla/5.0",
      metadata: { position: 2, widget: "floating_video" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { store_id: store.id },
    });
    expect(event.event_type).toBe("video_view");
    expect(event.video_id).toBe(video.id);
    expect(event.product_id).toBeNull();
    expect(event.session_id).toBe("sess-1");
    expect(event.visitor_id).toBe("visitor-1");
    expect(event.url).toBe("https://loja.example.com/produto");
    expect(event.referrer).toBe("https://google.com");
    expect(event.user_agent).toBe("Mozilla/5.0");
    expect(event.metadata).toEqual({ position: 2, widget: "floating_video" });
  });

  it("normalizes a non-object metadata to {}", async () => {
    const { store } = await createStore();

    const response = await request(app.server).post("/api/widget/events").send({
      store_id: store.id,
      event_type: "widget_view",
      metadata: "not-an-object",
    });

    expect(response.status).toBe(200);

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { store_id: store.id, event_type: "widget_view" },
    });
    expect(event.metadata).toEqual({});
  });
});
