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

// Ported from supabase/functions/asaas-create-subscription. Field checks stay
// in the handler (not strict zod types) so the machine-readable error codes
// the SPA switches on are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store the subscription belongs to."),
  plan_id: z
    .string()
    .optional()
    .describe(`Plan id (${PLAN_IDS.join(", ")}).`),
  coupon_code: z.string().optional().describe("Discount coupon code (case-insensitive)."),
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
    })
    .loose()
    .optional()
    .describe("Billing customer data (Asaas holder info)."),
  card: z
    .object({
      holderName: z.string().optional(),
      number: z.string().optional(),
      expiryMonth: z.string().optional(),
      expiryYear: z.string().optional(),
      ccv: z.string().optional(),
    })
    .loose()
    .optional()
    .describe("Credit card charged for the monthly subscription."),
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

export const CreateSubscriptionSchema = {
  schema: {
    summary: "Create Asaas credit-card subscription",
    description:
      "Charges a monthly credit-card subscription on Asaas for the store's plan, optionally " +
      "applying a discount coupon. When the store already has a reusable Asaas subscription " +
      "(active/pending/past_due) it is updated in place instead (`reused_subscription: true`). " +
      "Persists the subscription row, updates stores.plan_id and increments the coupon's " +
      "redemption count.",
    tags: ["billing"],
    operationId: "createAsaasSubscription",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        reused_subscription: z.boolean().optional(),
        subscription: SubscriptionSchema,
        subscription_id: z.string(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

type UsableCoupon = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: Date | null;
  expires_at: Date | null;
  is_active: boolean;
};

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function isCouponUsable(coupon: UsableCoupon) {
  const now = Date.now();
  const startsAt = coupon.starts_at ? coupon.starts_at.getTime() : 0;
  const expiresAt = coupon.expires_at
    ? coupon.expires_at.getTime()
    : Number.POSITIVE_INFINITY;
  const hasReachedLimit =
    typeof coupon.max_redemptions === "number" &&
    coupon.redemption_count >= coupon.max_redemptions;
  return (
    coupon.is_active && startsAt <= now && expiresAt >= now && !hasReachedLimit
  );
}

function calculatePrice(price: number, coupon: UsableCoupon | null) {
  if (!coupon) return { discountAmount: 0, finalPrice: price };
  const amountOff = coupon.amount_off ?? 0;
  const percentAmount = coupon.percent_off
    ? price * (coupon.percent_off / 100)
    : 0;
  const discountAmount = Math.min(price, amountOff || percentAmount);
  return {
    discountAmount,
    finalPrice: Math.max(0, Number((price - discountAmount).toFixed(2))),
  };
}

function isoDateDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createSubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!env.ASAAS_API_KEY) {
    return reply.status(500).send({ error: "missing_asaas_api_key" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = clean(body.store_id);
  const planId = clean(body.plan_id);
  const couponCode = clean(body.coupon_code).toUpperCase();
  const customer = asRecord(body.customer);
  const card = asRecord(body.card);

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!isPlanId(planId)) return reply.status(400).send({ error: "invalid_plan_id" });

  const name = clean(customer.name);
  const email = clean(customer.email);
  const cpfCnpj = digits(customer.cpfCnpj);
  const phone = digits(customer.phone);
  const postalCode = digits(customer.postalCode);
  const address = clean(customer.address);
  const addressNumber = clean(customer.addressNumber);
  const complement = clean(customer.complement);
  const province = clean(customer.province);

  const holderName = clean(card.holderName);
  const number = digits(card.number);
  const expiryMonth = digits(card.expiryMonth).padStart(2, "0");
  const expiryYear = digits(card.expiryYear);
  const ccv = digits(card.ccv);

  if (!name || !email || !cpfCnpj) {
    return reply.status(400).send({ error: "missing_customer_data" });
  }

  if (!postalCode || !address || !addressNumber || !province) {
    return reply.status(400).send({ error: "missing_customer_address" });
  }

  if (!holderName || number.length < 13 || !expiryMonth || !expiryYear || !ccv) {
    return reply.status(400).send({ error: "missing_card_data" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  // The store and coupon lookups are independent — fetch both at once.
  // The original matched the coupon with ilike on the upper-cased code;
  // Prisma's case-insensitive equals is the same lookup without the
  // expression index the Supabase schema had.
  const [store, couponRow] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true, url: true },
    }),
    couponCode
      ? prisma.discountCoupon.findFirst({
          where: { code: { equals: couponCode, mode: "insensitive" } },
          select: {
            id: true,
            code: true,
            percent_off: true,
            amount_off: true,
            max_redemptions: true,
            redemption_count: true,
            starts_at: true,
            expires_at: true,
            is_active: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!store) return reply.status(404).send({ error: "store_not_found" });

  const plan = PLANS[planId];
  const reference = `luup:${storeId}:${planId}:${Date.now()}`;

  try {
    let coupon: UsableCoupon | null = null;
    if (couponCode) {
      const candidate = couponRow
        ? {
            ...couponRow,
            percent_off:
              couponRow.percent_off === null ? null : Number(couponRow.percent_off),
            amount_off:
              couponRow.amount_off === null ? null : Number(couponRow.amount_off),
          }
        : null;

      if (!candidate || !isCouponUsable(candidate)) {
        return reply.status(400).send({ error: "invalid_discount_coupon" });
      }
      coupon = candidate;
    }

    const pricing = calculatePrice(plan.priceMonthly, coupon);

    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        store_id: storeId,
        provider: "asaas",
        status: { in: ["active", "pending", "past_due"] },
        provider_subscription_id: { not: null },
      },
      orderBy: { created_at: "desc" },
    });

    if (existingSubscription?.provider_subscription_id) {
      const asaasSubscription = await asaasRequest<Record<string, unknown>>(
        `/subscriptions/${existingSubscription.provider_subscription_id}`,
        {
          billingType: "CREDIT_CARD",
          cycle: "MONTHLY",
          description: `Assinatura mensal Luup - ${store.name || store.slug} - ${plan.name}`,
          externalReference: reference,
          updatePendingPayments: true,
          value: pricing.finalPrice,
        },
        "PUT",
      );

      const now = new Date();
      const currentPeriodEnd =
        existingSubscription.current_period_end ??
        (() => {
          const date = new Date();
          date.setMonth(date.getMonth() + 1);
          return date;
        })();

      const metadata = {
        ...asRecord(existingSubscription.metadata),
        asaas_subscription: asaasSubscription,
        discount: coupon
          ? {
              amount_off: coupon.amount_off,
              code: coupon.code,
              discount_amount: pricing.discountAmount,
              final_price: pricing.finalPrice,
              original_price: plan.priceMonthly,
              percent_off: coupon.percent_off,
            }
          : null,
        external_reference: reference,
        last_plan_change: {
          changed_at: now.toISOString(),
          from_plan_id: clean(existingSubscription.plan_id) || null,
          source: "checkout_existing_subscription",
          to_plan_id: planId,
          update_pending_payments: true,
          value: pricing.finalPrice,
        },
      };

      const nextStatus =
        existingSubscription.status === "active" ? "active" : "pending";

      const subscription = await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          current_period_end: currentPeriodEnd,
          current_period_start: existingSubscription.current_period_start ?? now,
          discount_amount: coupon ? pricing.discountAmount : null,
          discount_code: coupon?.code || null,
          discount_coupon_id: coupon?.id || null,
          discount_percent: coupon?.percent_off || null,
          metadata: metadata as Prisma.InputJsonValue,
          plan_id: planId,
          provider_status: String(asaasSubscription.status || "subscription_updated"),
          status: nextStatus,
        },
      });

      await prisma.store.update({
        where: { id: storeId },
        data: { plan_id: planId },
      });

      if (coupon?.id) {
        await prisma.discountCoupon.update({
          where: { id: coupon.id },
          data: { redemption_count: { increment: 1 } },
        });
      }

      return reply.status(200).send({
        reused_subscription: true,
        subscription,
        subscription_id: existingSubscription.provider_subscription_id,
      });
    }

    const asaasCustomer = await asaasRequest<Record<string, unknown>>(
      "/customers",
      {
        address,
        addressNumber,
        complement: complement || undefined,
        cpfCnpj,
        email,
        externalReference: reference,
        mobilePhone: phone || undefined,
        name,
        phone: phone || undefined,
        postalCode,
        province,
      },
    );
    const customerId = String(asaasCustomer.id || "");
    if (!customerId) {
      return reply.status(502).send({ error: "missing_asaas_customer_id" });
    }

    const asaasSubscription = await asaasRequest<Record<string, unknown>>(
      "/subscriptions",
      {
        billingType: "CREDIT_CARD",
        creditCard: { ccv, expiryMonth, expiryYear, holderName, number },
        creditCardHolderInfo: {
          addressComplement: complement || undefined,
          addressNumber,
          cpfCnpj,
          email,
          mobilePhone: phone || undefined,
          name,
          phone: phone || undefined,
          postalCode,
        },
        customer: customerId,
        cycle: "MONTHLY",
        description: `Assinatura mensal Luup - ${store.name || store.slug} - ${plan.name}`,
        externalReference: reference,
        nextDueDate: isoDateDaysFromNow(0),
        value: pricing.finalPrice,
      },
    );
    const subscriptionId = String(asaasSubscription.id || "");
    if (!subscriptionId) {
      return reply.status(502).send({ error: "missing_asaas_subscription_id" });
    }

    const now = new Date();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        current_period_start: now,
        current_period_end: currentPeriodEnd,
        metadata: {
          asaas_customer: asaasCustomer,
          asaas_subscription: asaasSubscription,
          discount: coupon
            ? {
                amount_off: coupon.amount_off,
                code: coupon.code,
                discount_amount: pricing.discountAmount,
                percent_off: coupon.percent_off,
                final_price: pricing.finalPrice,
                original_price: plan.priceMonthly,
              }
            : null,
          customer: {
            address,
            addressNumber,
            complement,
            cpfCnpj,
            email,
            name,
            phone,
            postalCode,
            province,
          },
          external_reference: reference,
        } as Prisma.InputJsonValue,
        plan_id: planId,
        provider: "asaas",
        provider_customer_id: customerId,
        discount_amount: coupon ? pricing.discountAmount : null,
        discount_code: coupon?.code || null,
        discount_coupon_id: coupon?.id || null,
        discount_percent: coupon?.percent_off || null,
        provider_status: String(asaasSubscription.status || "subscription_created"),
        provider_subscription_id: subscriptionId,
        status: "pending",
        store_id: storeId,
      },
    });

    if (coupon?.id) {
      await prisma.discountCoupon.update({
        where: { id: coupon.id },
        data: { redemption_count: { increment: 1 } },
      });
    }

    return reply.status(200).send({
      subscription,
      subscription_id: subscriptionId,
    });
  } catch (error) {
    return reply.status(502).send({
      error: error instanceof Error ? error.message : "asaas_subscription_failed",
    });
  }
}
