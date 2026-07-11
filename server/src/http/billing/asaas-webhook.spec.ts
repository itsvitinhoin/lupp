import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";

const WEBHOOK_TOKEN = "test-webhook-token";

async function createPendingSubscription(
  overrides: Record<string, unknown> = {},
) {
  const { store } = await createStore({ plan_id: "start" });
  const subscription = await prisma.subscription.create({
    data: {
      store_id: store.id,
      plan_id: "growth",
      provider: "asaas",
      status: "pending",
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
  return { store, subscription };
}

describe("POST /api/webhooks/asaas (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    await createPlans();
    env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  });

  afterAll(async () => {
    env.ASAAS_WEBHOOK_TOKEN = undefined;
    await app.close();
  });

  it("returns 500 when the webhook token is not configured", async () => {
    env.ASAAS_WEBHOOK_TOKEN = undefined;
    try {
      const response = await request(app.server)
        .post("/api/webhooks/asaas")
        .send({ event: "PAYMENT_CONFIRMED" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "missing_asaas_webhook_token" });
    } finally {
      env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
    }
  });

  it("rejects a missing or wrong token", async () => {
    const missing = await request(app.server)
      .post("/api/webhooks/asaas")
      .send({ event: "PAYMENT_CONFIRMED" });
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: "invalid_webhook_token" });

    const wrong = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", "nope")
      .send({ event: "PAYMENT_CONFIRMED" });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "invalid_webhook_token" });
  });

  it("accepts the token from any of the supported headers", async () => {
    for (const setHeader of [
      (r: request.Test) => r.set("asaas-access-token", WEBHOOK_TOKEN),
      (r: request.Test) => r.set("access_token", WEBHOOK_TOKEN),
      (r: request.Test) => r.set("x-asaas-token", WEBHOOK_TOKEN),
      (r: request.Test) => r.set("Authorization", `Bearer ${WEBHOOK_TOKEN}`),
    ]) {
      const response = await setHeader(
        request(app.server).post("/api/webhooks/asaas"),
      ).send({ event: "PAYMENT_CONFIRMED" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, ignored: "missing_reference" });
    }
  });

  it("acknowledges but ignores events for unknown subscriptions", async () => {
    const response = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_1", subscription: "sub_unknown" },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, ignored: "subscription_not_found" });
  });

  it("activates a subscription on PAYMENT_CONFIRMED, renews the period and promotes the store plan", async () => {
    const { store, subscription } = await createPendingSubscription({
      provider_subscription_id: "sub_hook_1",
    });

    const payload = {
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_hook_1",
        subscription: "sub_hook_1",
        externalReference: `luup:${store.id}:growth:123`,
      },
    };
    const response = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("active");
    expect(row.provider_status).toBe("PAYMENT_CONFIRMED");
    expect(row.provider_payment_id).toBe("pay_hook_1");
    // Period renewed to ~1 month ahead.
    const inTwentyDays = Date.now() + 20 * 24 * 60 * 60 * 1000;
    expect(row.current_period_end!.getTime()).toBeGreaterThan(inTwentyDays);
    const metadata = row.metadata as { last_asaas_event: { event: string } };
    expect(metadata.last_asaas_event.event).toBe("PAYMENT_CONFIRMED");

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("growth");
  });

  it("resolves by provider_checkout_id and adopts the subscription id on CHECKOUT_PAID", async () => {
    const { store, subscription } = await createPendingSubscription({
      provider_checkout_id: "chk_hook_1",
    });

    const response = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({
        event: "CHECKOUT_PAID",
        checkout: { id: "chk_hook_1" },
      });

    expect(response.status).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("active");
    expect(row.provider_status).toBe("CHECKOUT_PAID");
    const metadata = row.metadata as { last_asaas_checkout: { id: string } };
    expect(metadata.last_asaas_checkout.id).toBe("chk_hook_1");

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("growth");
  });

  it("falls back to the luup externalReference and marks overdue payments past_due", async () => {
    const { store, subscription } = await createPendingSubscription();
    const previousPeriodEnd = subscription.current_period_end!;

    const response = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({
        event: "PAYMENT_OVERDUE",
        payment: { externalReference: `luup:${store.id}:growth:987` },
      });

    expect(response.status).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("past_due");
    expect(row.provider_status).toBe("PAYMENT_OVERDUE");
    // No renewal on non-payment events.
    expect(row.current_period_end!.toISOString()).toBe(
      previousPeriodEnd.toISOString(),
    );

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("start");
  });

  it("marks SUBSCRIPTION_DELETED canceling while the paid period lasts, canceled after", async () => {
    const future = await createPendingSubscription({
      provider_subscription_id: "sub_hook_future",
      status: "active",
      current_period_end: new Date(Date.now() + 10 * 86_400_000),
    });
    const past = await createPendingSubscription({
      provider_subscription_id: "sub_hook_past",
      status: "active",
      current_period_end: new Date(Date.now() - 86_400_000),
    });

    for (const [id, expected] of [
      ["sub_hook_future", "canceling"],
      ["sub_hook_past", "canceled"],
    ] as const) {
      const response = await request(app.server)
        .post("/api/webhooks/asaas")
        .set("asaas-access-token", WEBHOOK_TOKEN)
        .send({ event: "SUBSCRIPTION_DELETED", subscription: { id } });

      expect(response.status).toBe(200);
      const row = await prisma.subscription.findFirstOrThrow({
        where: { provider_subscription_id: id },
      });
      expect(row.status).toBe(expected);
    }

    // Non-active statuses never promote the store plan.
    for (const { store } of [future, past]) {
      const updatedStore = await prisma.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { plan_id: true },
      });
      expect(updatedStore.plan_id).toBe("start");
    }
  });

  it("blocks the subscription on refunds and keeps unknown events as provider_status only", async () => {
    const { subscription } = await createPendingSubscription({
      provider_subscription_id: "sub_hook_refund",
      status: "active",
    });

    const refund = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({
        event: "PAYMENT_REFUNDED",
        payment: { id: "pay_refund", subscription: "sub_hook_refund" },
      });
    expect(refund.status).toBe(200);
    let row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(row.status).toBe("blocked");

    const unknown = await request(app.server)
      .post("/api/webhooks/asaas")
      .set("asaas-access-token", WEBHOOK_TOKEN)
      .send({
        event: "PAYMENT_CREATED",
        payment: { id: "pay_new", subscription: "sub_hook_refund" },
      });
    expect(unknown.status).toBe(200);
    row = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    // Status untouched, provider bookkeeping updated.
    expect(row.status).toBe("blocked");
    expect(row.provider_status).toBe("PAYMENT_CREATED");
    expect(row.provider_payment_id).toBe("pay_new");
  });
});
