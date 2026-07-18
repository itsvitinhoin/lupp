import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { deleteAsaasSubscription } from "@/lib/asaas";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { asRecord } from "@/lib/text";

// Ported from supabase/functions/asaas-cancel-subscription. Field checks stay
// in the handler so the machine-readable error codes the SPA switches on are
// preserved.
const BodySchema = z.object({
  store_id: z
    .string()
    .optional()
    .describe("Store whose Asaas subscription is canceled."),
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

export const CancelSubscriptionSchema = {
  schema: {
    summary: "Cancel Asaas subscription",
    description:
      "Deletes the store's current Asaas subscription (active/pending/past_due) upstream and " +
      "marks the row `canceling` (access kept until the paid period ends) or `canceled` when " +
      "the period is already over. Returns 404 when there is no provider subscription.",
    tags: ["billing"],
    operationId: "cancelAsaasSubscription",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        access_until: z.string(),
        subscription: SubscriptionSchema,
        subscription_id: z.string(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function cancelSubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!env.ASAAS_API_KEY) {
    return reply.status(500).send({ error: "missing_asaas_api_key" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const currentSubscription = await prisma.subscription.findFirst({
    where: {
      store_id: storeId,
      provider: "asaas",
      status: { in: ["active", "pending", "past_due"] },
      provider_subscription_id: { not: null },
    },
    orderBy: { created_at: "desc" },
  });

  if (!currentSubscription?.provider_subscription_id) {
    return reply.status(404).send({ error: "subscription_not_found" });
  }

  const now = new Date();
  const periodEnd = currentSubscription.current_period_end ?? now;
  const accessUntil = periodEnd.getTime() > now.getTime() ? periodEnd : now;
  const nextStatus =
    accessUntil.getTime() > now.getTime() ? "canceling" : "canceled";

  try {
    const asaasResponse = await deleteAsaasSubscription(
      currentSubscription.provider_subscription_id,
    );
    const nowIso = now.toISOString();
    const accessUntilIso = accessUntil.toISOString();
    const metadata = {
      ...asRecord(currentSubscription.metadata),
      cancellation: {
        access_until: accessUntilIso,
        asaas_response: asaasResponse,
        requested_at: nowIso,
        source: "merchant_admin",
      },
    };

    const subscription = await prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        current_period_end: accessUntil,
        metadata: metadata as Prisma.InputJsonValue,
        provider_status: "cancel_at_period_end",
        status: nextStatus,
      },
    });

    return reply.status(200).send({
      access_until: accessUntilIso,
      subscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  } catch (error) {
    return reply.status(502).send({
      error:
        error instanceof Error
          ? error.message
          : "asaas_subscription_cancel_failed",
    });
  }
}
