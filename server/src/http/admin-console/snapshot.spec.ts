import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { AdminConsoleRoutes } from "./routes";

// The orchestrator wires AdminConsoleRoutes into src/routes.ts; until then
// the spec registers the domain itself (guarded to avoid duplicate routes).
const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "AdminConsoleRoutes",
);


describe("GET /api/admin-console (e2e)", () => {
  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    await createPlans();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).get("/api/admin-console");

    expect(response.status).toBe(401);
  });

  it("rejects a valid JWT whose user row is gone with invalid_user", async () => {
    const token = app.jwt.sign({ sub: randomUUID(), role: "admin" });

    const response = await request(app.server)
      .get("/api/admin-console")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_user" });
  });

  it("denies a non-admin JWT claim at the middleware", async () => {
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .get("/api/admin-console")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Unauthorized." });
  });

  it("denies a stale admin claim once the DB role is no longer admin", async () => {
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "admin" });

    const response = await request(app.server)
      .get("/api/admin-console")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "admin_access_denied" });
  });

  it("returns the full cross-store snapshot for an admin-role user", async () => {
    const admin = await createUser({ role: "admin" });
    const token = app.jwt.sign({ sub: admin.id, role: "admin" });

    // Paid store: active growth subscription with a 10% discount → MRR 179.1.
    const { owner: ownerA, store: storeA } = await createStore({ plan_id: "growth" });
    const paidSubscription = await prisma.subscription.create({
      data: {
        store_id: storeA.id,
        plan_id: "growth",
        status: "active",
        discount_percent: 10,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.video.create({
      data: { store_id: storeA.id, title: "Ready", status: "active", processing_status: "ready" },
    });
    await prisma.video.create({
      data: {
        store_id: storeA.id,
        title: "Processing",
        status: "draft",
        processing_status: "processing",
      },
    });
    await prisma.product.create({ data: { store_id: storeA.id, name: "Produto" } });
    await prisma.widget.create({
      data: { store_id: storeA.id, name: "Widget", type: "floating_video", status: "active" },
    });
    await prisma.integration.create({
      data: {
        store_id: storeA.id,
        provider: "nuvemshop",
        status: "active",
        external_store_id: "42",
      },
    });
    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: storeA.id, event_type: "video_view" },
        { store_id: storeA.id, event_type: "video_view" },
        { store_id: storeA.id, event_type: "add_to_cart_click" },
        // Outside the snapshot's monitored event set — must not be counted.
        { store_id: storeA.id, event_type: "like_click" },
      ],
    });

    // Trialing store (7-day trial subscription from the builder).
    const { store: storeB } = await createStore({ withTrialSubscription: true });

    const auditLog = await prisma.adminConsoleAuditLog.create({
      data: {
        action: "pause_store",
        admin_email: admin.email,
        admin_user_id: admin.id,
        target_store_id: storeA.id,
        payload: { store_id: storeA.id },
        result: { store: { id: storeA.id, status: "paused" } },
      },
    });

    const response = await request(app.server)
      .get("/api/admin-console")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.generated_at).toBe("string");

    const rowA = response.body.stores.find((row: { id: string }) => row.id === storeA.id);
    expect(rowA).toMatchObject({
      active_videos: 1,
      processing_videos: 1,
      products: 1,
      active_widgets: 1,
      video_views_month: 2,
      add_to_cart_month: 1,
      feed_opens_month: 0,
      plan_id: "growth",
      plan_name: "Growth",
      subscription_id: paidSubscription.id,
      subscription_status: "active",
      status: "active",
      owner_email: ownerA.email,
      owner_name: ownerA.name,
      slug: storeA.slug,
    });
    expect(rowA.mrr).toBeCloseTo(179.1);
    expect(rowA.trial_days_left).toBe(7);
    expect(rowA.active_integrations).toEqual([
      { external_store_id: "42", last_sync_at: null, provider: "nuvemshop", status: "active" },
    ]);

    const rowB = response.body.stores.find((row: { id: string }) => row.id === storeB.id);
    expect(rowB.subscription_status).toBe("trialing");
    expect(rowB.mrr).toBe(0);
    expect(rowB.plan_id).toBe("start");

    expect(response.body.metrics).toMatchObject({
      activeStores: 2,
      pausedStores: 0,
      paidStores: 1,
      trialStores: 1,
      trialsEndingSoon: 0,
      expiredTrials: 0,
      activeVideos: 1,
      processingVideos: 1,
      monthViews: 2,
      monthAddToCart: 1,
    });
    expect(response.body.metrics.mrr).toBeCloseTo(179.1);
    expect(response.body.metrics.arr).toBeCloseTo(179.1 * 12);

    const auditIds = response.body.audit_logs.map((log: { id: string }) => log.id);
    expect(auditIds).toContain(auditLog.id);
  });
});
