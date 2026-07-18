import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { asaasRequest } from "@/lib/asaas";
import { isPlanId, PLAN_IDS, PLANS } from "@/lib/plans";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { asRecord, clean } from "@/lib/text";

// Ported from supabase/functions/asaas-change-plan. Field checks stay in the
// handler so the machine-readable error codes the SPA switches on are
// preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose paid plan changes."),
  plan_id: z
    .string()
    .optional()
    .describe(`Target plan id (${PLAN_IDS.join(", ")}).`),
});

const SubscriptionSchema = z
  .object({
    id: z.string(),
    store_id: z.string(),
    plan_id: z.string().nullable(),
    status: z.string(),
    provider_status: z.string().nullable(),
    provider_subscription_id: z.string().nullable(),
    metadata: z.any(),
  })
  .loose();

export const ChangePlanSchema = {
  schema: {
    summary: "Change paid plan",
    description:
      "Changes the plan of the store's current Asaas subscription (active/pending/past_due): " +
      "updates the subscription's value on Asaas (updating pending payments), clears any " +
      "discount, and updates the subscription row and stores.plan_id. Returns 404 when the " +
      "store has no provider subscription; a same-plan request is a no-op.",
    tags: ["billing"],
    operationId: "changeAsaasPlan",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        subscription: SubscriptionSchema,
        subscription_id: z.string(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function changePlanHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!env.ASAAS_API_KEY) {
    return reply.status(500).send({ error: "missing_asaas_api_key" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = clean(body.store_id);
  const planId = clean(body.plan_id);

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!isPlanId(planId)) return reply.status(400).send({ error: "invalid_plan_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, slug: true },
  });

  if (!store) return reply.status(404).send({ error: "store_not_found" });

  // Unlike asaas-cancel-subscription, the original did not filter by
  // provider here — kept as-is.
  const currentSubscription = await prisma.subscription.findFirst({
    where: {
      store_id: storeId,
      status: { in: ["active", "pending", "past_due"] },
      provider_subscription_id: { not: null },
    },
    orderBy: { created_at: "desc" },
  });

  if (!currentSubscription?.provider_subscription_id) {
    return reply.status(404).send({ error: "subscription_not_found" });
  }

  const previousPlanId = clean(currentSubscription.plan_id);
  if (previousPlanId === planId) {
    return reply.status(200).send({
      subscription: currentSubscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  }

  const plan = PLANS[planId];
  const reference = `luup:${storeId}:${planId}:change:${Date.now()}`;

  try {
    const asaasSubscription = await asaasRequest<Record<string, unknown>>(
      `/subscriptions/${currentSubscription.provider_subscription_id}`,
      {
        billingType: "CREDIT_CARD",
        cycle: "MONTHLY",
        description: `Assinatura mensal Luup - ${store.name || store.slug} - ${plan.name}`,
        externalReference: reference,
        updatePendingPayments: true,
        value: plan.priceMonthly,
      },
      "PUT",
    );

    const now = new Date().toISOString();
    const metadata = {
      ...asRecord(currentSubscription.metadata),
      last_plan_change: {
        asaas_subscription: asaasSubscription,
        changed_at: now,
        from_plan_id: previousPlanId || null,
        to_plan_id: planId,
        update_pending_payments: true,
        value: plan.priceMonthly,
      },
    };
    const nextStatus =
      currentSubscription.status === "active" ? "active" : "pending";

    const subscription = await prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        discount_amount: null,
        discount_code: null,
        discount_coupon_id: null,
        discount_percent: null,
        metadata: metadata as Prisma.InputJsonValue,
        plan_id: planId,
        provider_status: String(asaasSubscription.status || "plan_changed"),
        status: nextStatus,
      },
    });

    await prisma.store.update({
      where: { id: storeId },
      data: { plan_id: planId },
    });

    return reply.status(200).send({
      subscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  } catch (error) {
    return reply.status(502).send({
      error: error instanceof Error ? error.message : "asaas_plan_change_failed",
    });
  }
}
