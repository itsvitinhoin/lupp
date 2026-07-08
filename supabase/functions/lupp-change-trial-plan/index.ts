import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const plans = {
  start: { name: "Start" },
  growth: { name: "Growth" },
  pro: { name: "Pro" },
  scale: { name: "Scale" },
} as const;

type PlanId = keyof typeof plans;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in plans;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
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

  const { data: currentSubscription, error: subscriptionLookupError } =
    await supabase
      .from("subscriptions")
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "trialing")
      .is("provider_subscription_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (subscriptionLookupError) {
    return jsonResponse({ error: subscriptionLookupError.message }, 500);
  }

  if (!currentSubscription?.id) {
    return jsonResponse({ error: "trial_subscription_not_found" }, 404);
  }

  const periodEnd = currentSubscription.current_period_end
    ? new Date(currentSubscription.current_period_end).getTime()
    : 0;
  if (periodEnd <= Date.now()) {
    return jsonResponse({ error: "trial_expired" }, 409);
  }

  const previousPlanId = clean(currentSubscription.plan_id);
  if (previousPlanId === planId) {
    return jsonResponse({
      subscription: currentSubscription,
      subscription_id: currentSubscription.id,
    });
  }

  const now = new Date().toISOString();
  const metadata = {
    ...asRecord(currentSubscription.metadata),
    last_trial_plan_change: {
      changed_at: now,
      from_plan_id: previousPlanId || null,
      to_plan_id: planId,
    },
  };

  const { data: subscription, error: updateError } = await supabase
    .from("subscriptions")
    .update({
      metadata,
      plan_id: planId,
      provider_status: "trial_plan_changed",
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
    subscription_id: subscription.id,
  });
});
