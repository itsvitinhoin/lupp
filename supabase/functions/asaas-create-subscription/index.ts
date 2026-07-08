import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const plans = {
  start: { name: "Start", priceMonthly: 149 },
  growth: { name: "Growth", priceMonthly: 199 },
  pro: { name: "Pro", priceMonthly: 299 },
  scale: { name: "Scale", priceMonthly: 499 },
} as const;

type PlanId = keyof typeof plans;

type DiscountCoupon = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in plans;
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCouponCode(value: unknown) {
  return clean(value).toUpperCase();
}

function isCouponUsable(coupon: DiscountCoupon) {
  const now = Date.now();
  const startsAt = coupon.starts_at ? new Date(coupon.starts_at).getTime() : 0;
  const expiresAt = coupon.expires_at
    ? new Date(coupon.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  const hasReachedLimit =
    typeof coupon.max_redemptions === "number" &&
    coupon.redemption_count >= coupon.max_redemptions;
  return (
    coupon.is_active && startsAt <= now && expiresAt >= now && !hasReachedLimit
  );
}

function calculatePrice(price: number, coupon: DiscountCoupon | null) {
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

function asaasApiBase() {
  const environment = String(
    Deno.env.get("ASAAS_ENVIRONMENT") || "production",
  ).toLowerCase();
  return environment === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

async function readAsaasError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && Array.isArray(body.errors) && body.errors[0]?.description) {
    return String(body.errors[0].description);
  }
  if (body && typeof body.message === "string") return body.message;
  return "asaas_request_failed";
}

async function asaasRequest<T>(
  path: string,
  apiKey: string,
  payload: Record<string, unknown>,
  method: "POST" | "PUT" = "POST",
) {
  const response = await fetch(`${asaasApiBase()}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    method,
  });

  if (!response.ok) {
    throw new Error(await readAsaasError(response));
  }

  return (await response.json()) as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  if (!asaasApiKey) {
    return jsonResponse({ error: "missing_asaas_api_key" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "missing_authorization" }, 401);

  const body = await req.json().catch(() => ({}));
  const storeId = clean(body.store_id);
  const planId = clean(body.plan_id);
  const couponCode = normalizeCouponCode(body.coupon_code);
  const customer =
    body.customer && typeof body.customer === "object"
      ? (body.customer as Record<string, unknown>)
      : {};
  const card =
    body.card && typeof body.card === "object"
      ? (body.card as Record<string, unknown>)
      : {};

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!isPlanId(planId)) return jsonResponse({ error: "invalid_plan_id" }, 400);

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
    return jsonResponse({ error: "missing_customer_data" }, 400);
  }

  if (!postalCode || !address || !addressNumber || !province) {
    return jsonResponse({ error: "missing_customer_address" }, 400);
  }

  if (
    !holderName ||
    number.length < 13 ||
    !expiryMonth ||
    !expiryYear ||
    !ccv
  ) {
    return jsonResponse({ error: "missing_card_data" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "invalid_user" }, 401);
  }

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) return jsonResponse({ error: "store_access_denied" }, 403);

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, url")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return jsonResponse({ error: "store_not_found" }, 404);

  const plan = plans[planId];
  const reference = `luup:${storeId}:${planId}:${Date.now()}`;

  try {
    let coupon: DiscountCoupon | null = null;
    if (couponCode) {
      const { data: couponData, error: couponError } = await supabase
        .from("discount_coupons")
        .select(
          "id, code, percent_off, amount_off, max_redemptions, redemption_count, starts_at, expires_at, is_active",
        )
        .ilike("code", couponCode)
        .maybeSingle();

      if (couponError) {
        return jsonResponse({ error: couponError.message }, 500);
      }
      if (!couponData || !isCouponUsable(couponData as DiscountCoupon)) {
        return jsonResponse({ error: "invalid_discount_coupon" }, 400);
      }
      coupon = couponData as DiscountCoupon;
    }

    const pricing = calculatePrice(plan.priceMonthly, coupon);

    const { data: existingSubscription, error: existingSubscriptionError } =
      await supabase
        .from("subscriptions")
        .select("*")
        .eq("store_id", storeId)
        .eq("provider", "asaas")
        .in("status", ["active", "pending", "past_due"])
        .not("provider_subscription_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingSubscriptionError) {
      return jsonResponse({ error: existingSubscriptionError.message }, 500);
    }

    if (existingSubscription?.provider_subscription_id) {
      const asaasSubscription = await asaasRequest<Record<string, unknown>>(
        `/subscriptions/${existingSubscription.provider_subscription_id}`,
        asaasApiKey,
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

      const now = new Date().toISOString();
      const currentPeriodEnd =
        existingSubscription.current_period_end ||
        (() => {
          const date = new Date();
          date.setMonth(date.getMonth() + 1);
          return date.toISOString();
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
          changed_at: now,
          from_plan_id: clean(existingSubscription.plan_id) || null,
          source: "checkout_existing_subscription",
          to_plan_id: planId,
          update_pending_payments: true,
          value: pricing.finalPrice,
        },
      };

      const nextStatus =
        existingSubscription.status === "active" ? "active" : "pending";

      const { data: subscription, error: subscriptionUpdateError } =
        await supabase
          .from("subscriptions")
          .update({
            current_period_end: currentPeriodEnd,
            current_period_start:
              existingSubscription.current_period_start || now,
            discount_amount: coupon ? pricing.discountAmount : null,
            discount_code: coupon?.code || null,
            discount_coupon_id: coupon?.id || null,
            discount_percent: coupon?.percent_off || null,
            metadata,
            plan_id: planId,
            provider_status: String(
              asaasSubscription.status || "subscription_updated",
            ),
            status: nextStatus,
          })
          .eq("id", existingSubscription.id)
          .select("*")
          .single();

      if (subscriptionUpdateError) {
        return jsonResponse({ error: subscriptionUpdateError.message }, 500);
      }

      const { error: storeUpdateError } = await supabase
        .from("stores")
        .update({ plan_id: planId })
        .eq("id", storeId);

      if (storeUpdateError) {
        return jsonResponse({ error: storeUpdateError.message }, 500);
      }

      if (coupon?.id) {
        await supabase
          .from("discount_coupons")
          .update({ redemption_count: coupon.redemption_count + 1 })
          .eq("id", coupon.id);
      }

      return jsonResponse({
        reused_subscription: true,
        subscription,
        subscription_id: existingSubscription.provider_subscription_id,
      });
    }

    const asaasCustomer = await asaasRequest<Record<string, unknown>>(
      "/customers",
      asaasApiKey,
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
      return jsonResponse({ error: "missing_asaas_customer_id" }, 502);
    }

    const asaasSubscription = await asaasRequest<Record<string, unknown>>(
      "/subscriptions",
      asaasApiKey,
      {
        billingType: "CREDIT_CARD",
        creditCard: {
          ccv,
          expiryMonth,
          expiryYear,
          holderName,
          number,
        },
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
      return jsonResponse({ error: "missing_asaas_subscription_id" }, 502);
    }

    const now = new Date().toISOString();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .insert({
        current_period_start: now,
        current_period_end: currentPeriodEnd.toISOString(),
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
        },
        plan_id: planId,
        provider: "asaas",
        provider_customer_id: customerId,
        discount_amount: coupon ? pricing.discountAmount : null,
        discount_code: coupon?.code || null,
        discount_coupon_id: coupon?.id || null,
        discount_percent: coupon?.percent_off || null,
        provider_status: String(
          asaasSubscription.status || "subscription_created",
        ),
        provider_subscription_id: subscriptionId,
        status: "pending",
        store_id: storeId,
      })
      .select("*")
      .single();

    if (subscriptionError) {
      return jsonResponse({ error: subscriptionError.message }, 500);
    }

    if (coupon?.id) {
      await supabase
        .from("discount_coupons")
        .update({ redemption_count: coupon.redemption_count + 1 })
        .eq("id", coupon.id);
    }

    return jsonResponse({
      subscription,
      subscription_id: subscriptionId,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "asaas_subscription_failed",
      },
      502,
    );
  }
});
