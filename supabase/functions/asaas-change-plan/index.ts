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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in plans;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
) {
  const response = await fetch(`${asaasApiBase()}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    method: "PUT",
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

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!isPlanId(planId)) return jsonResponse({ error: "invalid_plan_id" }, 400);

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
    .select("id, name, slug")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return jsonResponse({ error: "store_not_found" }, 404);

  const { data: currentSubscription, error: subscriptionLookupError } =
    await supabase
      .from("subscriptions")
      .select("*")
      .eq("store_id", storeId)
      .in("status", ["active", "pending", "past_due"])
      .not("provider_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (subscriptionLookupError) {
    return jsonResponse({ error: subscriptionLookupError.message }, 500);
  }

  if (!currentSubscription?.provider_subscription_id) {
    return jsonResponse({ error: "subscription_not_found" }, 404);
  }

  const previousPlanId = clean(currentSubscription.plan_id);
  if (previousPlanId === planId) {
    return jsonResponse({
      subscription: currentSubscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  }

  const plan = plans[planId];
  const reference = `luup:${storeId}:${planId}:change:${Date.now()}`;

  try {
    const asaasSubscription = await asaasRequest<Record<string, unknown>>(
      `/subscriptions/${currentSubscription.provider_subscription_id}`,
      asaasApiKey,
      {
        billingType: "CREDIT_CARD",
        cycle: "MONTHLY",
        description: `Assinatura mensal Luup - ${store.name || store.slug} - ${plan.name}`,
        externalReference: reference,
        updatePendingPayments: true,
        value: plan.priceMonthly,
      },
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

    const { data: subscription, error: updateError } = await supabase
      .from("subscriptions")
      .update({
        discount_amount: null,
        discount_code: null,
        discount_coupon_id: null,
        discount_percent: null,
        metadata,
        plan_id: planId,
        provider_status: String(asaasSubscription.status || "plan_changed"),
        status: nextStatus,
      })
      .eq("id", currentSubscription.id)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    const { error: storeUpdateError } = await supabase
      .from("stores")
      .update({ plan_id: planId })
      .eq("id", storeId);

    if (storeUpdateError) {
      return jsonResponse({ error: storeUpdateError.message }, 500);
    }

    return jsonResponse({
      subscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "asaas_plan_change_failed",
      },
      502,
    );
  }
});
