import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/asaas-webhook. Public route — Asaas
// authenticates with the shared webhook token, sent (depending on the panel
// configuration) in one of several headers.
const BodySchema = z
  .object({
    event: z.string().optional().describe("Asaas event name (PAYMENT_CONFIRMED, ...)."),
    payment: z.any().optional(),
    checkout: z.any().optional(),
    subscription: z.any().optional(),
    checkoutSession: z.any().optional(),
    externalReference: z.any().optional(),
  })
  .loose();

export const AsaasWebhookSchema = {
  schema: {
    summary: "Asaas webhook",
    description:
      "Receives Asaas billing events (authenticated by the shared webhook token). Resolves " +
      "the subscription by provider_subscription_id, then provider_checkout_id, then the " +
      "`luup:<store>:<plan>:...` externalReference; maps the event to a subscription status, " +
      "renews the period on payment events, and promotes stores.plan_id when it activates. " +
      "Unresolvable events are acknowledged with `ignored` so Asaas stops retrying.",
    tags: ["billing"],
    operationId: "asaasWebhook",
    body: BodySchema,
    response: {
      200: z.object({ ok: z.boolean(), ignored: z.string().optional() }),
      ...edgeErrorSchemas,
    },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Same string comparison as the original, hardened to constant time.
function tokenMatches(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function statusFromEvent(
  event: string,
  subscription: { current_period_end: Date | null },
) {
  if (
    event === "PAYMENT_CONFIRMED" ||
    event === "PAYMENT_RECEIVED" ||
    event === "CHECKOUT_PAID" ||
    event === "SUBSCRIPTION_CREATED" ||
    event === "SUBSCRIPTION_UPDATED"
  ) {
    return "active";
  }
  if (
    event === "PAYMENT_OVERDUE" ||
    event === "PAYMENT_DELETED" ||
    event === "CHECKOUT_CANCELED" ||
    event === "CHECKOUT_EXPIRED"
  ) {
    return "past_due";
  }
  if (event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED") {
    const periodEnd = subscription.current_period_end?.getTime() ?? 0;
    return periodEnd > Date.now() ? "canceling" : "canceled";
  }
  if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_CHARGEBACK_REQUESTED") {
    return "blocked";
  }
  return "";
}

export async function asaasWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const webhookToken = String(env.ASAAS_WEBHOOK_TOKEN || "").trim();
  if (!webhookToken) {
    return reply.status(500).send({ error: "missing_asaas_webhook_token" });
  }

  const authorization = headerValue(request.headers.authorization)?.replace(
    /^Bearer\s+/i,
    "",
  );
  const received =
    headerValue(request.headers["asaas-access-token"]) ||
    headerValue(request.headers["access_token"]) ||
    headerValue(request.headers["x-asaas-token"]) ||
    authorization ||
    "";
  if (!tokenMatches(String(received).trim(), webhookToken)) {
    return reply.status(401).send({ error: "invalid_webhook_token" });
  }

  const payload = asRecord(request.body);
  const event = String(payload.event || "");
  const payment = asRecord(payload.payment);
  const checkout = asRecord(payload.checkout);
  const subscriptionPayload = asRecord(payload.subscription);
  const externalReference = String(
    payment.externalReference ||
      checkout.externalReference ||
      subscriptionPayload.externalReference ||
      payload.externalReference ||
      "",
  );
  const paymentId = String(payment.id || "");
  const asaasSubscriptionId = String(
    payment.subscription || subscriptionPayload.id || payload.subscription || "",
  );
  const checkoutId = String(
    payment.checkoutSession ||
      payment.checkout ||
      checkout.id ||
      checkout.checkoutSession ||
      subscriptionPayload.checkoutSession ||
      payload.checkoutSession ||
      "",
  );

  const parts = externalReference.split(":");
  const storeId = parts[0] === "luup" ? parts[1] : "";
  const planId = parts[0] === "luup" ? parts[2] : "";

  let subscription;
  if (asaasSubscriptionId) {
    subscription = await prisma.subscription.findFirst({
      where: { provider_subscription_id: asaasSubscriptionId },
    });
  } else if (checkoutId) {
    subscription = await prisma.subscription.findFirst({
      where: { provider_checkout_id: checkoutId },
    });
  } else if (storeId && planId) {
    subscription = await prisma.subscription.findFirst({
      where: { store_id: storeId, plan_id: planId },
      orderBy: { created_at: "desc" },
    });
  } else {
    return reply.status(200).send({ ok: true, ignored: "missing_reference" });
  }

  if (!subscription?.id) {
    return reply
      .status(200)
      .send({ ok: true, ignored: "subscription_not_found" });
  }

  const nextStatus = statusFromEvent(event, subscription);
  const shouldRenewPeriod =
    nextStatus === "active" &&
    (event === "PAYMENT_CONFIRMED" ||
      event === "PAYMENT_RECEIVED" ||
      event === "CHECKOUT_PAID" ||
      event === "SUBSCRIPTION_CREATED" ||
      event === "SUBSCRIPTION_UPDATED");
  const periodEnd = shouldRenewPeriod ? new Date() : null;
  if (periodEnd) periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      current_period_end: periodEnd ?? subscription.current_period_end,
      metadata: {
        ...asRecord(subscription.metadata),
        last_asaas_checkout: checkout,
        last_asaas_event: payload,
      } as Prisma.InputJsonValue,
      provider_payment_id: paymentId || subscription.provider_payment_id,
      provider_status: event || subscription.provider_status,
      provider_subscription_id:
        asaasSubscriptionId || subscription.provider_subscription_id,
      status: nextStatus || subscription.status,
    },
  });

  if (nextStatus === "active" && subscription.store_id && subscription.plan_id) {
    await prisma.store.update({
      where: { id: subscription.store_id },
      data: { plan_id: subscription.plan_id },
    });
  }

  return reply.status(200).send({ ok: true });
}
