import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function statusFromEvent(
  event: string,
  subscription?: Record<string, unknown>,
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
  if (
    event === "SUBSCRIPTION_INACTIVATED" ||
    event === "SUBSCRIPTION_DELETED"
  ) {
    const periodEnd = subscription?.current_period_end
      ? new Date(String(subscription.current_period_end)).getTime()
      : 0;
    return periodEnd > Date.now() ? "canceling" : "canceled";
  }
  if (
    event === "PAYMENT_REFUNDED" ||
    event === "PAYMENT_CHARGEBACK_REQUESTED"
  ) {
    return "blocked";
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const webhookToken = String(Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "").trim();
  if (webhookToken) {
    const authorization = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const received =
      req.headers.get("asaas-access-token") ||
      req.headers.get("access_token") ||
      req.headers.get("x-asaas-token") ||
      authorization ||
      "";
    if (String(received).trim() !== webhookToken) {
      return jsonResponse({ error: "invalid_webhook_token" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  const payload = await req.json().catch(() => ({}));
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
    payment.subscription ||
      subscriptionPayload.id ||
      payload.subscription ||
      "",
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
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase.from("subscriptions").select("*").limit(1);
  if (asaasSubscriptionId) {
    query = query.eq("provider_subscription_id", asaasSubscriptionId);
  } else if (checkoutId) {
    query = query.eq("provider_checkout_id", checkoutId);
  } else if (storeId && planId) {
    query = query
      .eq("store_id", storeId)
      .eq("plan_id", planId)
      .order("created_at", {
        ascending: false,
      });
  } else {
    return jsonResponse({ ok: true, ignored: "missing_reference" });
  }

  const { data: subscriptions, error: findError } = await query;
  if (findError) return jsonResponse({ error: findError.message }, 500);
  const subscription = subscriptions?.[0];

  if (!subscription?.id) {
    return jsonResponse({ ok: true, ignored: "subscription_not_found" });
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

  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({
      current_period_end: periodEnd
        ? periodEnd.toISOString()
        : subscription.current_period_end,
      metadata: {
        ...asRecord(subscription.metadata),
        last_asaas_checkout: checkout,
        last_asaas_event: payload,
      },
      provider_payment_id: paymentId || subscription.provider_payment_id,
      provider_status: event || subscription.provider_status,
      provider_subscription_id:
        asaasSubscriptionId || subscription.provider_subscription_id,
      status: nextStatus || subscription.status,
    })
    .eq("id", subscription.id);

  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  if (
    nextStatus === "active" &&
    subscription.store_id &&
    subscription.plan_id
  ) {
    await supabase
      .from("stores")
      .update({ plan_id: subscription.plan_id })
      .eq("id", subscription.store_id);
  }

  return jsonResponse({ ok: true });
});
