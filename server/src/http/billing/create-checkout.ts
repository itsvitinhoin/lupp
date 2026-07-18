import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { asaasCheckoutBaseUrl, asaasFetch, readAsaasError } from "@/lib/asaas";
import { isPlanId, PLAN_IDS, PLANS } from "@/lib/plans";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { clean } from "@/lib/text";

// Ported from supabase/functions/asaas-create-checkout. Field checks stay in
// the handler so the machine-readable error codes the SPA switches on are
// preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store the checkout belongs to."),
  plan_id: z
    .string()
    .optional()
    .describe(`Plan id (${PLAN_IDS.join(", ")}).`),
  customer: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      cpfCnpj: z.string().optional(),
      phone: z.string().optional(),
      postalCode: z.string().optional(),
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      complement: z.string().optional(),
      province: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    })
    .loose()
    .optional()
    .describe("Customer data prefilled on the hosted checkout."),
});

const SubscriptionSchema = z
  .object({
    id: z.string(),
    store_id: z.string(),
    plan_id: z.string().nullable(),
    status: z.string(),
    provider_status: z.string().nullable(),
    provider_checkout_id: z.string().nullable(),
    provider_checkout_url: z.string().nullable(),
    metadata: z.any(),
  })
  .loose();

export const CreateCheckoutSchema = {
  schema: {
    summary: "Create Asaas hosted checkout",
    description:
      "Creates a recurring credit-card checkout session on Asaas for the store's plan and " +
      "records a pending subscription pointing at it. Returns the hosted checkout URL the " +
      "SPA redirects to; the asaas webhook activates the subscription once paid.",
    tags: ["billing"],
    operationId: "createAsaasCheckout",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        checkout_id: z.string(),
        checkout_url: z.string(),
        subscription: SubscriptionSchema,
      }),
      ...edgeErrorSchemas,
      // The original attached the upstream HTTP status to the 502 body.
      502: z.object({ error: z.string(), status: z.number().optional() }),
    },
  },
};

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function isoDateDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createCheckoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!env.ASAAS_API_KEY) {
    return reply.status(500).send({ error: "missing_asaas_api_key" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = clean(body.store_id);
  const planId = clean(body.plan_id);
  const customer =
    body.customer && typeof body.customer === "object" ? body.customer : {};

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!isPlanId(planId)) return reply.status(400).send({ error: "invalid_plan_id" });

  const cpfCnpj = digits(customer.cpfCnpj);
  const name = clean(customer.name);
  const email = clean(customer.email);
  const phone = digits(customer.phone);
  const postalCode = digits(customer.postalCode);
  const address = clean(customer.address);
  const addressNumber = clean(customer.addressNumber);
  const complement = clean(customer.complement);
  const province = clean(customer.province);
  const city = clean(customer.city);
  const state = clean(customer.state).toUpperCase();

  if (!name || !email || !cpfCnpj) {
    return reply.status(400).send({ error: "missing_customer_data" });
  }

  if (!postalCode || !address || !addressNumber || !province) {
    return reply.status(400).send({ error: "missing_customer_address" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, slug: true, url: true },
  });

  if (!store) return reply.status(404).send({ error: "store_not_found" });

  const plan = PLANS[planId];
  const reference = `luup:${storeId}:${planId}:${Date.now()}`;
  const callbackUrl = `${env.LUPP_APP_URL.replace(/\/$/, "")}/app/billing`;
  const checkoutPayload = {
    billingTypes: ["CREDIT_CARD"],
    callback: {
      cancelUrl: `${callbackUrl}?checkout=cancel`,
      expiredUrl: `${callbackUrl}?checkout=expired`,
      successUrl: `${callbackUrl}?checkout=success`,
    },
    chargeTypes: ["RECURRENT"],
    customerData: {
      address,
      addressNumber,
      complement: complement || undefined,
      cpfCnpj,
      email,
      name,
      phone: phone || undefined,
      postalCode,
      province,
    },
    items: [
      {
        description: `Assinatura mensal Luup - ${store.name || store.slug}`,
        name: `Luup ${plan.name}`,
        quantity: 1,
        value: plan.priceMonthly,
      },
    ],
    minutesToExpire: 60,
    subscription: {
      cycle: "MONTHLY",
      nextDueDate: isoDateDaysFromNow(0),
    },
    externalReference: reference,
  };

  const response = await asaasFetch("/checkouts", checkoutPayload);

  if (!response.ok) {
    return reply
      .status(502)
      .send({ error: await readAsaasError(response), status: response.status });
  }

  const checkout = (await response.json()) as Record<string, unknown>;
  const checkoutId = String(checkout.id || "");
  if (!checkoutId) {
    return reply.status(502).send({ error: "missing_asaas_checkout_id" });
  }

  const checkoutUrl = `${asaasCheckoutBaseUrl()}?id=${encodeURIComponent(checkoutId)}`;
  const now = new Date();
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  const subscription = await prisma.subscription.create({
    data: {
      current_period_start: now,
      current_period_end: currentPeriodEnd,
      metadata: {
        asaas_checkout: checkout,
        customer: {
          address,
          addressNumber,
          city,
          complement,
          cpfCnpj,
          email,
          name,
          phone,
          postalCode,
          province,
          state,
        },
        external_reference: reference,
      } as Prisma.InputJsonValue,
      plan_id: planId,
      provider: "asaas",
      provider_checkout_id: checkoutId,
      provider_checkout_url: checkoutUrl,
      provider_status: "checkout_created",
      status: "pending",
      store_id: storeId,
    },
  });

  return reply.status(200).send({
    checkout_id: checkoutId,
    checkout_url: checkoutUrl,
    subscription,
  });
}
