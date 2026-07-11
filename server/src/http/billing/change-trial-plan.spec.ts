import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

describe("POST /api/billing/trial-plan (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    await createPlans();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .send({ store_id: "any", plan_id: "growth" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id and an unknown plan with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan_id: "growth" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const badPlan = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store", plan_id: "mega" });
    expect(badPlan.status).toBe(400);
    expect(badPlan.body).toEqual({ error: "invalid_plan_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore({ withTrialSubscription: true });
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 404 when the store has no trialing subscription", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "trial_subscription_not_found" });
  });

  it("returns 409 when the trial has expired", async () => {
    const { owner, store, subscription } = await createStore({
      withTrialSubscription: true,
    });
    await prisma.subscription.update({
      where: { id: subscription!.id },
      data: { current_period_end: new Date(Date.now() - 60_000) },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "trial_expired" });
  });

  it("changes the plan on both the subscription and the store, recording metadata", async () => {
    const { owner, store, subscription } = await createStore({
      plan_id: "start",
      withTrialSubscription: true,
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(200);
    expect(response.body.subscription_id).toBe(subscription!.id);
    expect(response.body.subscription.plan_id).toBe("growth");
    expect(response.body.subscription.provider_status).toBe("trial_plan_changed");

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("growth");

    const updatedSubscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription!.id },
    });
    const metadata = updatedSubscription.metadata as {
      last_trial_plan_change: { from_plan_id: string; to_plan_id: string };
    };
    expect(metadata.last_trial_plan_change.from_plan_id).toBe("start");
    expect(metadata.last_trial_plan_change.to_plan_id).toBe("growth");
  });

  it("is a no-op returning the current subscription when the plan is unchanged", async () => {
    const { owner, store, subscription } = await createStore({
      plan_id: "pro",
      withTrialSubscription: true,
    });
    await prisma.subscription.update({
      where: { id: subscription!.id },
      data: { plan_id: "pro" },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "pro" });

    expect(response.status).toBe(200);
    expect(response.body.subscription.provider_status).toBeNull();
  });

  it("ignores an already-paid subscription (provider_subscription_id set)", async () => {
    const { owner, store, subscription } = await createStore({
      withTrialSubscription: true,
    });
    await prisma.subscription.update({
      where: { id: subscription!.id },
      data: { provider_subscription_id: "asaas-sub-1" },
    });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/trial-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "trial_subscription_not_found" });
  });
});
