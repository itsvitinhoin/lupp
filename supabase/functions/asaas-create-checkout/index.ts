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

function normalizeDocument(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePostalCode(value: unknown) {
  return String(value || "").replace(/\D/g, "");
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

function checkoutBaseUrl() {
  const environment = String(
    Deno.env.get("ASAAS_ENVIRONMENT") || "production",
  ).toLowerCase();
  return environment === "sandbox"
    ? "https://sandbox.asaas.com/checkoutSession/show"
    : "https://asaas.com/checkoutSession/show";
}

async function readAsaasError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && Array.isArray(body.errors) && body.errors[0]?.description) {
    return String(body.errors[0].description);
  }
  if (body && typeof body.message === "string") return body.message;
  return "asaas_request_failed";
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
  const appUrl =
    Deno.env.get("LUPP_APP_URL") || "https://www.playluup.com.br";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  if (!asaasApiKey) {
    return jsonResponse({ error: "missing_asaas_api_key" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  const planId = String(body.plan_id || "").trim();
  const customer = body.customer && typeof body.customer === "object"
    ? (body.customer as Record<string, unknown>)
    : {};

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!isPlanId(planId)) return jsonResponse({ error: "invalid_plan_id" }, 400);

  const cpfCnpj = normalizeDocument(customer.cpfCnpj);
  const name = String(customer.name || "").trim();
  const email = String(customer.email || "").trim();
  const phone = normalizePhone(customer.phone);
  const postalCode = normalizePostalCode(customer.postalCode);
  const address = String(customer.address || "").trim();
  const addressNumber = String(customer.addressNumber || "").trim();
  const complement = String(customer.complement || "").trim();
  const province = String(customer.province || "").trim();
  const city = String(customer.city || "").trim();
  const state = String(customer.state || "").trim().toUpperCase();

  if (!name || !email || !cpfCnpj) {
    return jsonResponse({ error: "missing_customer_data" }, 400);
  }

  if (!postalCode || !address || !addressNumber || !province) {
    return jsonResponse({ error: "missing_customer_address" }, 400);
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
  const callbackUrl = `${appUrl.replace(/\/$/, "")}/app/billing`;
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

  const response = await fetch(`${asaasApiBase()}/checkouts`, {
    body: JSON.stringify(checkoutPayload),
    headers: {
      "Content-Type": "application/json",
      access_token: asaasApiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    return jsonResponse(
      { error: await readAsaasError(response), status: response.status },
      502,
    );
  }

  const checkout = (await response.json()) as Record<string, unknown>;
  const checkoutId = String(checkout.id || "");
  if (!checkoutId) {
    return jsonResponse({ error: "missing_asaas_checkout_id" }, 502);
  }

  const checkoutUrl = `${checkoutBaseUrl()}?id=${encodeURIComponent(checkoutId)}`;
  const now = new Date().toISOString();
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .insert({
      current_period_start: now,
      current_period_end: currentPeriodEnd.toISOString(),
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
      },
      plan_id: planId,
      provider: "asaas",
      provider_checkout_id: checkoutId,
      provider_checkout_url: checkoutUrl,
      provider_status: "checkout_created",
      status: "pending",
      store_id: storeId,
    })
    .select("*")
    .single();

  if (subscriptionError) {
    return jsonResponse({ error: subscriptionError.message }, 500);
  }

  return jsonResponse({
    checkout_id: checkoutId,
    checkout_url: checkoutUrl,
    subscription,
  });
});
