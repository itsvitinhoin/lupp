import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const fetchMock = vi.fn();

async function createPaidStore(currentPeriodEnd: Date | null) {
  const { owner, store } = await createStore();
  const subscription = await prisma.subscription.create({
    data: {
      store_id: store.id,
      plan_id: "growth",
      provider: "asaas",
      provider_subscription_id: "sub_cancel_1",
      status: "active",
      current_period_start: new Date(),
      current_period_end: currentPeriodEnd,
    },
  });
  return { owner, store, subscription };
}

describe("POST /api/billing/cancel-subscription (e2e)", () => {
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
      new Response(JSON.stringify({ deleted: true, id: "sub_cancel_1" }), {
        status: 200,
      }),
    );
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .send({ store_id: "any" });

    expect(response.status).toBe(401);
  });

  it("returns 500 missing_asaas_api_key when the integration is not configured", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    env.ASAAS_API_KEY = undefined;
    try {
      const response = await request(app.server)
        .post("/api/billing/cancel-subscription")
        .set("Authorization", `Bearer ${token}`)
        .send({ store_id: "any" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "missing_asaas_api_key" });
    } finally {
      env.ASAAS_API_KEY = "test-asaas-key";
    }
  });

  it("rejects a missing store_id with a machine-readable code", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createPaidStore(new Date(Date.now() + 86_400_000));
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 404 when the store has no Asaas subscription", async () => {
    const { owner, store } = await createStore({ withTrialSubscription: true });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "subscription_not_found" });
  });

  it("deletes the subscription on Asaas and keeps access until the period end (canceling)", async () => {
    const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const { owner, store, subscription } = await createPaidStore(periodEnd);
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body.subscription_id).toBe("sub_cancel_1");
    expect(response.body.access_until).toBe(periodEnd.toISOString());

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_cancel_1",
    );
    expect((init as RequestInit).method).toBe("DELETE");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.access_token).toBe("test-asaas-key");

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("canceling");
    expect(row.provider_status).toBe("cancel_at_period_end");
    expect(row.current_period_end?.toISOString()).toBe(periodEnd.toISOString());
    const metadata = row.metadata as {
      cancellation: { access_until: string; source: string; asaas_response: unknown };
    };
    expect(metadata.cancellation.access_until).toBe(periodEnd.toISOString());
    expect(metadata.cancellation.source).toBe("merchant_admin");
    expect(metadata.cancellation.asaas_response).toEqual({
      deleted: true,
      id: "sub_cancel_1",
    });
  });

  it("cancels immediately when the paid period is already over", async () => {
    const { owner, store, subscription } = await createPaidStore(
      new Date(Date.now() - 86_400_000),
    );
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("canceled");
    // Access ends now, not at the stale period end.
    expect(response.body.access_until).toBe(
      row.current_period_end?.toISOString(),
    );
  });

  it("surfaces Asaas errors as 502 and leaves the subscription untouched", async () => {
    const { owner, store, subscription } = await createPaidStore(
      new Date(Date.now() + 86_400_000),
    );
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ description: "already deleted" }] }),
        { status: 400 },
      ),
    );

    const response = await request(app.server)
      .post("/api/billing/cancel-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "already deleted" });

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("active");
  });
});
