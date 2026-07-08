import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
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

async function deleteAsaasSubscription(
  providerSubscriptionId: string,
  apiKey: string,
) {
  const response = await fetch(
    `${asaasApiBase()}/subscriptions/${providerSubscriptionId}`,
    {
      headers: { access_token: apiKey },
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await readAsaasError(response));
  }

  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
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
  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);

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
      .eq("provider", "asaas")
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

  const now = new Date();
  const periodEnd = currentSubscription.current_period_end
    ? new Date(currentSubscription.current_period_end)
    : now;
  const accessUntil = periodEnd.getTime() > now.getTime() ? periodEnd : now;
  const nextStatus =
    accessUntil.getTime() > now.getTime() ? "canceling" : "canceled";

  try {
    const asaasResponse = await deleteAsaasSubscription(
      currentSubscription.provider_subscription_id,
      asaasApiKey,
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

    const { data: subscription, error: updateError } = await supabase
      .from("subscriptions")
      .update({
        current_period_end: accessUntilIso,
        metadata,
        provider_status: "cancel_at_period_end",
        status: nextStatus,
      })
      .eq("id", currentSubscription.id)
      .select("*")
      .single();

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({
      access_until: accessUntilIso,
      subscription,
      subscription_id: currentSubscription.provider_subscription_id,
    });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "asaas_subscription_cancel_failed",
      },
      502,
    );
  }
});
