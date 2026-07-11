import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const fetchMock = vi.fn();

async function createPaidStore(plan_id = "start", status = "active") {
  const { owner, store } = await createStore({ plan_id });
  const subscription = await prisma.subscription.create({
    data: {
      store_id: store.id,
      plan_id,
      provider: "asaas",
      provider_subscription_id: "sub_paid_1",
      status,
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      discount_code: "LAUNCH10",
      discount_percent: 10,
      discount_amount: 14.9,
    },
  });
  return { owner, store, subscription };
}

describe("POST /api/billing/change-plan (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    await createPlans();
    env.ASAAS_API_KEY = "test-asaas-key";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    env.ASAAS_API_KEY = undefined;
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_paid_1", status: "ACTIVE" }), {
        status: 200,
      }),
    );
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .send({ store_id: "any", plan_id: "growth" });

    expect(response.status).toBe(401);
  });

  it("returns 500 missing_asaas_api_key when the integration is not configured", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    env.ASAAS_API_KEY = undefined;
    try {
      const response = await request(app.server)
        .post("/api/billing/change-plan")
        .set("Authorization", `Bearer ${token}`)
        .send({ store_id: "any", plan_id: "growth" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "missing_asaas_api_key" });
    } finally {
      env.ASAAS_API_KEY = "test-asaas-key";
    }
  });

  it("rejects a missing store_id and an unknown plan with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan_id: "growth" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const badPlan = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store", plan_id: "mega" });
    expect(badPlan.status).toBe(400);
    expect(badPlan.body).toEqual({ error: "invalid_plan_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createPaidStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 404 when the store has no provider subscription", async () => {
    const { owner, store } = await createStore({ withTrialSubscription: true });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "subscription_not_found" });
  });

  it("is a no-op returning the current subscription when the plan is unchanged", async () => {
    const { owner, store } = await createPaidStore("growth");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(200);
    expect(response.body.subscription_id).toBe("sub_paid_1");
    expect(response.body.subscription.plan_id).toBe("growth");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates the Asaas subscription, clears the discount and promotes the store plan", async () => {
    const { owner, store, subscription } = await createPaidStore("start");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(200);
    expect(response.body.subscription_id).toBe("sub_paid_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_paid_1",
    );
    expect((init as RequestInit).method).toBe("PUT");
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.value).toBe(199);
    expect(payload.updatePendingPayments).toBe(true);
    expect(payload.externalReference).toMatch(
      new RegExp(`^luup:${store.id}:growth:change:\\d+$`),
    );

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.plan_id).toBe("growth");
    expect(row.status).toBe("active");
    expect(row.provider_status).toBe("ACTIVE");
    expect(row.discount_code).toBeNull();
    expect(row.discount_percent).toBeNull();
    expect(row.discount_amount).toBeNull();
    expect(row.discount_coupon_id).toBeNull();
    const metadata = row.metadata as {
      last_plan_change: { from_plan_id: string; to_plan_id: string };
    };
    expect(metadata.last_plan_change.from_plan_id).toBe("start");
    expect(metadata.last_plan_change.to_plan_id).toBe("growth");

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("growth");
  });

  it("keeps a non-active subscription pending after the change", async () => {
    const { owner, store, subscription } = await createPaidStore("start", "past_due");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "pro" });

    expect(response.status).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("pending");
  });

  it("surfaces Asaas errors as 502 with the upstream description", async () => {
    const { owner, store, subscription } = await createPaidStore("start");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "subscription not found" }), {
        status: 404,
      }),
    );

    const response = await request(app.server)
      .post("/api/billing/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, plan_id: "growth" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "subscription not found" });

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.plan_id).toBe("start");
  });
});
