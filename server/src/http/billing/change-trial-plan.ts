import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { isPlanId, PLAN_IDS } from "@/lib/plans";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/lupp-change-trial-plan. Field checks stay in
// the handler (not strict zod types) so the machine-readable error codes the
// SPA switches on ("missing_store_id", "invalid_plan_id") are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose trial plan changes."),
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
    metadata: z.any(),
  })
  .loose();

export const ChangeTrialPlanSchema = {
  schema: {
    summary: "Change trial plan",
    description:
      "Changes the plan of a still-valid trial subscription (status `trialing`, no provider " +
      "subscription). Updates the subscription and the store's plan_id. Returns 404 when no " +
      "trial subscription exists, 409 when the trial has expired, and 403 when the caller is " +
      "not a member of the store.",
    tags: ["billing"],
    operationId: "changeTrialPlan",
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

export async function changeTrialPlanHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const planId = (body.plan_id ?? "").trim();

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!isPlanId(planId)) return reply.status(400).send({ error: "invalid_plan_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const currentSubscription = await prisma.subscription.findFirst({
    where: {
      store_id: storeId,
      status: "trialing",
      provider_subscription_id: null,
    },
    orderBy: { created_at: "desc" },
  });

  if (!currentSubscription) {
    return reply.status(404).send({ error: "trial_subscription_not_found" });
  }

  const periodEnd = currentSubscription.current_period_end?.getTime() ?? 0;
  if (periodEnd <= Date.now()) {
    return reply.status(409).send({ error: "trial_expired" });
  }

  const previousPlanId = currentSubscription.plan_id ?? "";
  if (previousPlanId === planId) {
    return reply.status(200).send({
      subscription: currentSubscription,
      subscription_id: currentSubscription.id,
    });
  }

  const metadata = {
    ...(typeof currentSubscription.metadata === "object" &&
    currentSubscription.metadata !== null &&
    !Array.isArray(currentSubscription.metadata)
      ? currentSubscription.metadata
      : {}),
    last_trial_plan_change: {
      changed_at: new Date().toISOString(),
      from_plan_id: previousPlanId || null,
      to_plan_id: planId,
    },
  };

  const subscription = await prisma.subscription.update({
    where: { id: currentSubscription.id },
    data: {
      metadata,
      plan_id: planId,
      provider_status: "trial_plan_changed",
    },
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { plan_id: planId },
  });

  return reply.status(200).send({
    subscription,
    subscription_id: subscription.id,
  });
}
