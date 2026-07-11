import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { MasterConsoleRoutes } from "./routes";

// The orchestrator wires MasterConsoleRoutes into src/routes.ts; until then
// the spec registers the domain itself (guarded to avoid duplicate routes).
const routesWired = readFileSync(new URL("../../routes.ts", import.meta.url), "utf8").includes(
  "MasterConsoleRoutes",
);

const adminEmail = env.MASTER_ADMIN_EMAILS.split(",")[0].trim();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("POST /api/master-console (e2e)", () => {
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    if (!routesWired) await app.register(MasterConsoleRoutes);
    await app.ready();
    await createPlans();
    const admin = await createUser({ email: adminEmail });
    adminId = admin.id;
    adminToken = app.jwt.sign({ sub: admin.id, role: "agent" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/master-console")
      .send({ action: "snapshot" });

    expect(response.status).toBe(401);
  });

  it("denies a non-allowlisted user", async () => {
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "pause_store", store_id: "whatever" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "master_access_denied" });
  });

  it("returns the snapshot when action is omitted", async () => {
    const response = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.metrics).toBeDefined();
    expect(Array.isArray(response.body.stores)).toBe(true);
    expect(typeof response.body.generated_at).toBe("string");
  });

  it("rejects an action without store_id and an unknown action", async () => {
    const missingStore = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "pause_store" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const unknown = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "explode_store", store_id: "some-store" });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ error: "unknown_action" });
  });

  it("pause_store pauses the store and writes an audit log", async () => {
    const { store } = await createStore();

    const response = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "pause_store", store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      result: { store: { id: store.id, status: "paused" } },
    });

    const updated = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updated.status).toBe("paused");

    const audit = await prisma.masterConsoleAuditLog.findFirstOrThrow({
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
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "activate_store", store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body.result.store).toEqual({ id: store.id, status: "active" });

    const updated = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(updated.status).toBe("active");

    const audit = await prisma.masterConsoleAuditLog.findFirst({
      where: { action: "activate_store", target_store_id: store.id },
    });
    expect(audit).not.toBeNull();
  });

  it("extend_trial pushes trial_ends_at and the trialing subscription period", async () => {
    const { store, subscription } = await createStore({ withTrialSubscription: true });

    const response = await request(app.server)
      .post("/api/master-console")
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

    const audit = await prisma.masterConsoleAuditLog.findFirst({
      where: { action: "extend_trial", target_store_id: store.id },
    });
    expect(audit).not.toBeNull();
  });

  it("extend_trial extends from a still-valid current_trial_ends_at", async () => {
    const { store } = await createStore();
    const currentEnd = new Date(Date.now() + 5 * DAY_MS);

    const response = await request(app.server)
      .post("/api/master-console")
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
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_plan", store_id: store.id });
    expect(missingPlan.status).toBe(400);
    expect(missingPlan.body).toEqual({ error: "missing_plan_id" });

    const unknownPlan = await request(app.server)
      .post("/api/master-console")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "set_plan", store_id: store.id, plan_id: "mega" });
    expect(unknownPlan.status).toBe(404);
    expect(unknownPlan.body).toEqual({ error: "plan_not_found" });

    // Failed validations must not leave an audit trail (the original returned
    // before auditing).
    const audits = await prisma.masterConsoleAuditLog.count({
      where: { action: "set_plan", target_store_id: store.id },
    });
    expect(audits).toBe(0);
  });

  it("set_plan updates the store and its latest subscription and writes an audit log", async () => {
    const { store, subscription } = await createStore({
      plan_id: "start",
      withTrialSubscription: true,
    });

    const response = await request(app.server)
      .post("/api/master-console")
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

    const audit = await prisma.masterConsoleAuditLog.findFirstOrThrow({
      where: { action: "set_plan", target_store_id: store.id },
    });
    expect(audit.result).toEqual({
      store: { id: store.id, plan_id: "pro" },
      subscription_id: subscription!.id,
    });
  });
});
