import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { AdminConsoleRoutes } from "./routes";

// The orchestrator wires AdminConsoleRoutes into src/routes.ts; until then
// the spec registers the domain itself (guarded to avoid duplicate routes).
const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "AdminConsoleRoutes",
);

describe("GET /api/admin-console/stores/:storeId/events (e2e)", () => {
  let adminToken: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    const admin = await createUser({ role: "admin" });
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires the admin role and an existing store", async () => {
    const outsider = await createUser();
    const outsiderToken = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const denied = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}/events`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(denied.status).toBe(401);
    expect(denied.body).toEqual({ message: "Unauthorized." });

    const missing = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}/events`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "store_not_found" });
  });

  it("paginates newest-first with a cursor and respects the day window", async () => {
    const { store } = await createStore();
    await prisma.analyticsEvent.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        store_id: store.id,
        event_type: "video_view" as const,
        url: `https://loja.example.com/p/${index}?utm_source=luup`,
      })),
    });
    // Outside every window: must never appear.
    await prisma.analyticsEvent.create({
      data: {
        store_id: store.id,
        event_type: "feed_open",
        created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      },
    });
    // Inside 90d but outside 30d.
    const oldEvent = await prisma.analyticsEvent.create({
      data: {
        store_id: store.id,
        event_type: "add_to_cart_click",
        created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      },
    });

    const firstPage = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/events`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.window_days).toBe(30);
    expect(firstPage.body.events).toHaveLength(20);
    expect(firstPage.body.next_cursor).toBe(firstPage.body.events[19].id);

    const secondPage = await request(app.server)
      .get(
        `/api/admin-console/stores/${store.id}/events?cursor=${firstPage.body.next_cursor}`,
      )
      .set("Authorization", `Bearer ${adminToken}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.events).toHaveLength(5);
    expect(secondPage.body.next_cursor).toBeNull();

    // No overlap between pages, newest first overall.
    const firstIds = firstPage.body.events.map((event: { id: string }) => event.id);
    const secondIds = secondPage.body.events.map((event: { id: string }) => event.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(25);
    expect(secondIds).not.toContain(oldEvent.id);

    const wide = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/events?days=90&limit=50`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(wide.status).toBe(200);
    expect(wide.body.window_days).toBe(90);
    expect(wide.body.events).toHaveLength(26);
    expect(wide.body.events.map((event: { id: string }) => event.id)).toContain(oldEvent.id);
    expect(wide.body.next_cursor).toBeNull();
  });

  it("filters by event types and by a URL search term", async () => {
    const { store } = await createStore();
    await prisma.analyticsEvent.createMany({
      data: [
        {
          store_id: store.id,
          event_type: "video_view" as const,
          url: "https://loja.example.com/produtos/tenis?utm_source=luup",
        },
        {
          store_id: store.id,
          event_type: "add_to_cart_click" as const,
          url: "https://loja.example.com/produtos/camiseta?utm_source=INSTAGRAM",
        },
        { store_id: store.id, event_type: "feed_open" as const, url: null },
      ],
    });

    const byTypes = await request(app.server)
      .get(
        `/api/admin-console/stores/${store.id}/events?types=video_view,add_to_cart_click`,
      )
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byTypes.status).toBe(200);
    expect(byTypes.body.events).toHaveLength(2);

    // Unknown types are ignored → no filter applied.
    const badTypes = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/events?types=explode,,`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(badTypes.body.events).toHaveLength(3);

    // Case-insensitive match against path + query string.
    const bySearch = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}/events?search=instagram`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(bySearch.body.events).toHaveLength(1);
    expect(bySearch.body.events[0].event_type).toBe("add_to_cart_click");

    const combined = await request(app.server)
      .get(
        `/api/admin-console/stores/${store.id}/events?types=video_view&search=utm_source`,
      )
      .set("Authorization", `Bearer ${adminToken}`);
    expect(combined.body.events).toHaveLength(1);
    expect(combined.body.events[0].event_type).toBe("video_view");
  });
});
