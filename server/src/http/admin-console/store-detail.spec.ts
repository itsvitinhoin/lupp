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


describe("GET /api/admin-console/stores/:storeId (e2e)", () => {
  let adminToken: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    await createPlans();
    const admin = await createUser({ role: "admin" });
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication and the admin role", async () => {
    const anonymous = await request(app.server).get(
      `/api/admin-console/stores/${randomUUID()}`,
    );
    expect(anonymous.status).toBe(401);

    // Non-admin JWT claim: rejected by the verifyUserRole middleware.
    const outsider = await createUser();
    const outsiderToken = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const denied = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(denied.status).toBe(401);
    expect(denied.body).toEqual({ message: "Unauthorized." });

    // Stale admin claim after a DB demotion: rejected by the handler gate.
    const staleToken = app.jwt.sign({ sub: outsider.id, role: "admin" });
    const stale = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}`)
      .set("Authorization", `Bearer ${staleToken}`);
    expect(stale.status).toBe(403);
    expect(stale.body).toEqual({ error: "admin_access_denied" });
  });

  it("returns 404 for an unknown store", async () => {
    const response = await request(app.server)
      .get(`/api/admin-console/stores/${randomUUID()}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "store_not_found" });
  });

  it("returns the full store detail including integration secrets", async () => {
    const { owner, store, subscription } = await createStore({
      plan_id: "growth",
      withTrialSubscription: true,
    });

    const member = await createUser({ name: "Equipe" });
    await prisma.storeMember.create({
      data: { store_id: store.id, user_id: member.id, role: "marketing" },
    });

    const integration = await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "nuvemshop",
        status: "active",
        external_store_id: "4242",
        settings: { script_mode: "nubesdk" },
        connected_at: new Date(),
      },
    });
    await prisma.integrationSecret.create({
      data: {
        integration_id: integration.id,
        provider: "nuvemshop",
        external_store_id: "4242",
        access_token: "tok_super_secret",
        token_type: "bearer",
        scope: "read_products write_scripts",
      },
    });
    await prisma.integrationWebhookEvent.create({
      data: {
        provider: "nuvemshop",
        external_store_id: "4242",
        event: "app/uninstalled",
        payload: { store_id: 4242 },
      },
    });

    const widget = await prisma.widget.create({
      data: {
        store_id: store.id,
        name: "Flutuante",
        type: "floating_video",
        status: "active",
        settings: { display: { position: "bottom_right" } },
      },
    });
    await prisma.feedSetting.create({
      data: { store_id: store.id, slug: "videos", settings: { theme: "dark" } },
    });
    await prisma.storeDomain.create({
      data: { store_id: store.id, domain: `loja-${randomUUID()}.example.com` },
    });
    await prisma.video.create({
      data: { store_id: store.id, title: "Vídeo", status: "active", processing_status: "ready" },
    });
    await prisma.product.create({ data: { store_id: store.id, name: "Produto" } });
    await prisma.analyticsEvent.createMany({
      data: [
        { store_id: store.id, event_type: "video_view" },
        { store_id: store.id, event_type: "video_view" },
        { store_id: store.id, event_type: "add_to_cart_click" },
      ],
    });
    const audit = await prisma.adminConsoleAuditLog.create({
      data: { action: "extend_trial", target_store_id: store.id, payload: {}, result: {} },
    });

    const response = await request(app.server)
      .get(`/api/admin-console/stores/${store.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const body = response.body;

    expect(body.store).toMatchObject({
      id: store.id,
      name: store.name,
      slug: store.slug,
      plan_id: "growth",
      status: "active",
      primary_color: "#006BFF",
    });
    expect(body.owner).toMatchObject({ id: owner.id, email: owner.email });
    expect(body.trial_days_left).toBe(7);
    expect(body.plan?.id).toBe("growth");
    expect(body.mrr).toBe(0); // trialing subscription contributes no MRR

    const memberEmails = body.members.map(
      (row: { user: { email: string } }) => row.user.email,
    );
    expect(memberEmails).toContain(member.email);

    expect(body.subscriptions.map((row: { id: string }) => row.id)).toContain(subscription!.id);

    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0]).toMatchObject({
      provider: "nuvemshop",
      status: "active",
      external_store_id: "4242",
      settings: { script_mode: "nubesdk" },
    });
    expect(body.integrations[0].secret).toMatchObject({
      access_token: "tok_super_secret",
      token_type: "bearer",
    });

    expect(body.widgets.map((row: { id: string }) => row.id)).toContain(widget.id);
    expect(body.feed_settings).toMatchObject({ slug: "videos", settings: { theme: "dark" } });
    expect(body.store_domains).toHaveLength(1);
    expect(body.counts).toMatchObject({
      videos_total: 1,
      videos_active: 1,
      videos_processing: 0,
      products_total: 1,
      products_active: 1,
      widgets_total: 1,
      widgets_active: 1,
      custom_pages: 0,
      comments_pending: 0,
      comments_total: 0,
      likes_total: 0,
      events_30d_total: 3,
    });

    const analytics = Object.fromEntries(
      body.analytics_30d.map(
        (row: { event_type: string; count: number }) => [row.event_type, row.count] as const,
      ),
    );
    expect(analytics.video_view).toBe(2);
    expect(analytics.add_to_cart_click).toBe(1);

    expect(body.audit_logs.map((row: { id: string }) => row.id)).toContain(audit.id);
    expect(body.webhook_events).toHaveLength(1);
    expect(body.webhook_events[0]).toMatchObject({ event: "app/uninstalled" });
    expect(typeof body.generated_at).toBe("string");
  });
});
