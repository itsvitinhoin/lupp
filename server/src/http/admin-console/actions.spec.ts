import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { mailer } from "@/lib/mailer";
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

const DAY_MS = 24 * 60 * 60 * 1000;

describe("POST /api/admin-console (e2e)", () => {
  let adminToken: string;
  let adminId: string;
  let adminEmail: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(AdminConsoleRoutes);
    await app.ready();
    await createPlans();
    const admin = await createUser({ role: "admin" });
    adminId = admin.id;
    adminEmail = admin.email;
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/admin-console")
      .send({ action: "snapshot" });

    expect(response.status).toBe(401);
  });

  it("denies a non-admin user", async () => {
    const outsider = await createUser();

    // Non-admin claim: stopped by the verifyUserRole middleware.
    const agentToken = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const deniedByClaim = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ action: "pause_store", store_id: "whatever" });
    expect(deniedByClaim.status).toBe(401);
    expect(deniedByClaim.body).toEqual({ message: "Unauthorized." });

    // Stale admin claim, non-admin DB role: stopped by the handler gate.
    const staleToken = app.jwt.sign({ sub: outsider.id, role: "admin" });
    const deniedByRole = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${staleToken}`)
      .send({ action: "pause_store", store_id: "whatever" });
    expect(deniedByRole.status).toBe(403);
    expect(deniedByRole.body).toEqual({ error: "admin_access_denied" });
  });

  it("returns the snapshot when action is omitted", async () => {
    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.metrics).toBeDefined();
    expect(Array.isArray(response.body.stores)).toBe(true);
    expect(typeof response.body.generated_at).toBe("string");
  });

  it("rejects an action without store_id and an unknown action", async () => {
    const missingStore = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "pause_store" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const unknown = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "explode_store", store_id: "some-store" });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ error: "unknown_action" });
  });

  it("pause_store pauses the store and writes an audit log", async () => {
    const { store } = await createStore();

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "pause_store", store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      result: { store: { id: store.id, status: "paused" } },
    });

    const updated = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updated.status).toBe("paused");

    const audit = await prisma.adminConsoleAuditLog.findFirstOrThrow({
      where: { action: "pause_store", target_store_id: store.id },
    });
    expect(audit.admin_email).toBe(adminEmail);
    expect(audit.admin_user_id).toBe(adminId);
    expect(audit.payload).toEqual({ action: "pause_store", store_id: store.id });
    expect(audit.result).toEqual({ store: { id: store.id, status: "paused" } });
  });

  it("activate_store reactivates a paused store and writes an audit log", async () => {
    const { store } = await createStore({ status: "paused" });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "activate_store", store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body.result.store).toEqual({ id: store.id, status: "active" });

    const updated = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updated.status).toBe("active");

    const audit = await prisma.adminConsoleAuditLog.findFirst({
      where: { action: "activate_store", target_store_id: store.id },
    });
    expect(audit).not.toBeNull();
  });

  it("extend_trial pushes trial_ends_at and the trialing subscription period", async () => {
    const { store, subscription } = await createStore({ withTrialSubscription: true });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "extend_trial", store_id: store.id, days: 10 });

    expect(response.status).toBe(200);
    const returnedEnd = new Date(response.body.result.store.trial_ends_at);
    // days extend from "now" when no still-valid current_trial_ends_at is sent.
    expect(returnedEnd.getTime()).toBeGreaterThan(Date.now() + 9 * DAY_MS);
    expect(returnedEnd.getTime()).toBeLessThan(Date.now() + 11 * DAY_MS);

    const updatedStore = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updatedStore.trial_ends_at?.getTime()).toBe(returnedEnd.getTime());

    const updatedSubscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription!.id },
    });
    expect(updatedSubscription.status).toBe("trialing");
    expect(updatedSubscription.current_period_end?.getTime()).toBe(returnedEnd.getTime());

    const audit = await prisma.adminConsoleAuditLog.findFirst({
      where: { action: "extend_trial", target_store_id: store.id },
    });
    expect(audit).not.toBeNull();
  });

  it("extend_trial extends from a still-valid current_trial_ends_at", async () => {
    const { store } = await createStore();
    const currentEnd = new Date(Date.now() + 5 * DAY_MS);

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "extend_trial",
        store_id: store.id,
        days: 10,
        current_trial_ends_at: currentEnd.toISOString(),
      });

    expect(response.status).toBe(200);
    const returnedEnd = new Date(response.body.result.store.trial_ends_at);
    expect(returnedEnd.getTime()).toBeGreaterThan(Date.now() + 14 * DAY_MS);
    expect(returnedEnd.getTime()).toBeLessThan(Date.now() + 16 * DAY_MS);
  });

  it("set_plan validates its inputs with the original codes", async () => {
    const { store } = await createStore();

    const missingPlan = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_plan", store_id: store.id });
    expect(missingPlan.status).toBe(400);
    expect(missingPlan.body).toEqual({ error: "missing_plan_id" });

    const unknownPlan = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_plan", store_id: store.id, plan_id: "mega" });
    expect(unknownPlan.status).toBe(404);
    expect(unknownPlan.body).toEqual({ error: "plan_not_found" });

    // Failed validations must not leave an audit trail (the original returned
    // before auditing).
    const audits = await prisma.adminConsoleAuditLog.count({
      where: { action: "set_plan", target_store_id: store.id },
    });
    expect(audits).toBe(0);
  });

  it("update_store patches whitelisted fields and writes an audit log", async () => {
    const { store } = await createStore();

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "update_store",
        store_id: store.id,
        patch: {
          name: "Renamed Store",
          url: "https://renamed.example.com",
          segment: "",
          primary_color: "#111111",
          status: "paused",
          // Not whitelisted — must be ignored, not written.
          plan_id: "pro",
          owner_id: "hijack",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.result.store).toEqual({
      id: store.id,
      name: "Renamed Store",
      url: "https://renamed.example.com",
      segment: null,
      primary_color: "#111111",
      status: "paused",
    });

    const updated = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updated.name).toBe("Renamed Store");
    expect(updated.url).toBe("https://renamed.example.com");
    expect(updated.segment).toBeNull();
    expect(updated.primary_color).toBe("#111111");
    expect(updated.status).toBe("paused");
    expect(updated.plan_id).toBe("start");
    expect(updated.owner_id).toBe(store.owner_id);

    const audit = await prisma.adminConsoleAuditLog.findFirst({
      where: { action: "update_store", target_store_id: store.id },
    });
    expect(audit).not.toBeNull();
  });

  it("update_store rejects an invalid status and an empty patch", async () => {
    const { store } = await createStore();

    const invalidStatus = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "update_store", store_id: store.id, patch: { status: "nuked" } });
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body).toEqual({ error: "invalid_status" });

    const emptyPatch = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "update_store", store_id: store.id, patch: { plan_id: "pro" } });
    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body).toEqual({ error: "empty_patch" });

    const untouched = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(untouched.status).toBe("active");
  });

  it("update_widget patches the widget and merges settings through the shared contract", async () => {
    const { store } = await createStore();
    const widget = await prisma.widget.create({
      data: { store_id: store.id, name: "Flutuante", type: "floating_video" },
    });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "update_widget",
        store_id: store.id,
        widget_id: widget.id,
        patch: {
          name: "Renomeado",
          status: "active",
          settings: { appearance: { position: "bottom-right" } },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.result.widget).toMatchObject({
      id: widget.id,
      name: "Renomeado",
      status: "active",
    });
    // Merge, not replace: the patched key lands and the contract defaults for
    // untouched keys are filled in by mergeWidgetSettings.
    expect(response.body.result.widget.settings.appearance.position).toBe("bottom-right");
    expect(response.body.result.widget.settings.appearance.label).toBeTruthy();

    const updated = await prisma.widget.findUniqueOrThrow({ where: { id: widget.id } });
    expect(updated.name).toBe("Renomeado");
    expect(updated.status).toBe("active");
  });

  it("update_widget rejects a widget from another store", async () => {
    const { store } = await createStore();
    const { store: otherStore } = await createStore();
    const foreignWidget = await prisma.widget.create({
      data: { store_id: otherStore.id, name: "Alheio", type: "floating_video" },
    });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "update_widget",
        store_id: store.id,
        widget_id: foreignWidget.id,
        patch: { name: "Hijack" },
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "widget_not_found" });
  });

  it("update_feed upserts the feed settings and shallow-merges its settings", async () => {
    const { store } = await createStore();

    const created = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "update_feed",
        store_id: store.id,
        patch: { slug: "Meus-Videos", settings: { theme: "dark" } },
      });
    expect(created.status).toBe(200);
    expect(created.body.result.feed_settings).toMatchObject({
      slug: "meus-videos",
      is_active: true,
      settings: { theme: "dark" },
    });

    const patched = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "update_feed",
        store_id: store.id,
        patch: { is_active: false, settings: { autoplay: true } },
      });
    expect(patched.status).toBe(200);
    expect(patched.body.result.feed_settings).toMatchObject({
      is_active: false,
      slug: "meus-videos",
      settings: { autoplay: true, theme: "dark" },
    });
  });

  it("manages store members: add (case-insensitive email), set role, remove", async () => {
    const { store } = await createStore();
    const teammate = await createUser({ email: `Teammate-${Date.now()}@Example.com` });

    const added = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "add_member",
        store_id: store.id,
        email: teammate.email.toLowerCase(),
        role: "editor",
      });
    expect(added.status).toBe(200);
    const memberId = added.body.result.member.id;
    expect(added.body.result.member).toMatchObject({ role: "editor", user_id: teammate.id });

    const duplicate = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "add_member", store_id: store.id, email: teammate.email });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "already_member" });

    const roleChanged = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "set_member_role",
        store_id: store.id,
        member_id: memberId,
        role: "marketing",
      });
    expect(roleChanged.status).toBe(200);
    expect(roleChanged.body.result.member.role).toBe("marketing");

    const removed = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "remove_member", store_id: store.id, member_id: memberId });
    expect(removed.status).toBe(200);
    expect(
      await prisma.storeMember.findUnique({ where: { id: memberId } }),
    ).toBeNull();
  });

  it("remove_member refuses to remove the owner's membership", async () => {
    const { membership, store } = await createStore();

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "remove_member", store_id: store.id, member_id: membership.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "cannot_remove_owner" });
    expect(
      await prisma.storeMember.findUnique({ where: { id: membership.id } }),
    ).not.toBeNull();
  });

  it("confirm_user_email confirms a store user and rejects outsiders", async () => {
    const { owner, store } = await createStore();
    await prisma.user.update({
      where: { id: owner.id },
      data: { email_confirmed_at: null },
    });

    const confirmed = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "confirm_user_email", store_id: store.id, user_id: owner.id });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.result.user).toMatchObject({ id: owner.id, already_confirmed: false });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(updated.email_confirmed_at).not.toBeNull();

    const outsider = await createUser();
    const denied = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "confirm_user_email", store_id: store.id, user_id: outsider.id });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({ error: "user_not_in_store" });
  });

  it("send_password_reset emails a reset link to a store user", async () => {
    const mailSpy = vi.spyOn(mailer, "send");
    const { owner, store } = await createStore();

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "send_password_reset", store_id: store.id, user_id: owner.id });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      sent: true,
      user: { id: owner.id, email: owner.email },
    });
    expect(mailSpy).toHaveBeenCalledTimes(1);
    const mail = mailSpy.mock.calls[0][0];
    expect(mail.to).toBe(owner.email);
    expect(mail.text).toMatch(/login\?reset=1&token=/);
    mailSpy.mockRestore();
  });

  it("set_plan updates the store and its latest subscription and writes an audit log", async () => {
    const { store, subscription } = await createStore({
      plan_id: "start",
      withTrialSubscription: true,
    });

    const response = await request(app.server)
      .post("/api/admin-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_plan", store_id: store.id, plan_id: "pro" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      result: {
        store: { id: store.id, plan_id: "pro" },
        subscription_id: subscription!.id,
      },
    });

    const updatedStore = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updatedStore.plan_id).toBe("pro");

    const updatedSubscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription!.id },
    });
    expect(updatedSubscription.plan_id).toBe("pro");

    const audit = await prisma.adminConsoleAuditLog.findFirstOrThrow({
      where: { action: "set_plan", target_store_id: store.id },
    });
    expect(audit.result).toEqual({
      store: { id: store.id, plan_id: "pro" },
      subscription_id: subscription!.id,
    });
  });
});
