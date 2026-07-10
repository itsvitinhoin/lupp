import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const UPZERO_API_BASE = "https://api.upzero.com.br";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function normalizedHostname(value: unknown) {
  const text = clean(value).toLowerCase();
  if (!text) return "";
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
      .hostname.replace(/^www\./, "");
  } catch (_) {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function requestHostname(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return normalizedHostname(origin);

  const referer = req.headers.get("referer");
  if (referer) return normalizedHostname(referer);

  return "";
}

function isInternalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "playluup.com.br" ||
    hostname === "www.playluup.com.br" ||
    hostname.endsWith(".vercel.app")
  );
}

function hostAllowed(req: Request, store: JsonRecord, integration: JsonRecord) {
  const hostname = requestHostname(req);
  if (!hostname) return true;
  if (isInternalHost(hostname)) return true;

  const settings = asRecord(integration.settings);
  const candidates = [
    store.url,
    settings.storefront_url,
    settings.base_url,
    settings.store_url,
  ]
    .map(normalizedHostname)
    .filter(Boolean);

  return candidates.some((candidate) => hostname === candidate);
}

async function readJsonOrText(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text.slice(0, 500) };
  }
}

function upzeroHeaders(req: Request, accessToken: string, hasBody = false) {
  const headers = new Headers({
    Accept: "application/json",
    "X-API-Key": accessToken,
    "x-api-key": accessToken,
  });

  if (hasBody) headers.set("Content-Type", "application/json");

  const authorization = req.headers.get("authorization") || "";
  if (/^Bearer\s+\S+/i.test(authorization)) {
    headers.set("Authorization", authorization);
  }

  return headers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const storeId = clean(body.store_id);
  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, slug, url, platform, status")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) return jsonResponse({ error: "store_lookup_failed" }, 500);
  if (!store) return jsonResponse({ error: "store_not_found" }, 404);
  if (store.status && store.status !== "active") {
    return jsonResponse({ error: "store_not_active" }, 403);
  }

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, provider, status, settings, external_store_id")
    .eq("store_id", storeId)
    .eq("provider", "upzero")
    .maybeSingle();

  if (integrationError) {
    return jsonResponse({ error: "upzero_integration_lookup_failed" }, 500);
  }
  if (!integration) {
    return jsonResponse({ error: "upzero_integration_not_found" }, 404);
  }
  if (["disabled", "inactive", "disconnected"].includes(clean(integration.status))) {
    return jsonResponse({ error: "upzero_integration_not_active" }, 403);
  }

  if (!hostAllowed(req, store, integration)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403);
  }

  const { data: secret, error: secretError } = await supabase
    .from("integration_secrets")
    .select("access_token")
    .eq("integration_id", integration.id)
    .maybeSingle();

  if (secretError) return jsonResponse({ error: "upzero_secret_lookup_failed" }, 500);

  const accessToken = clean(secret?.access_token);
  if (!accessToken) return jsonResponse({ error: "upzero_secret_missing" }, 424);

  if (action === "customer_status") {
    const response = await fetch(`${UPZERO_API_BASE}/v1/clients/me`, {
      headers: upzeroHeaders(req, accessToken),
    }).catch(() => null);

    if (!response) return jsonResponse({ error: "upzero_client_status_failed" }, 502);
    const parsed = await readJsonOrText(response);
    return jsonResponse(asRecord(parsed), response.status);
  }

  if (action === "cart_batch") {
    const payloads = Array.isArray(body.payloads)
      ? body.payloads
      : body.payload
        ? [body.payload]
        : [];

    if (!payloads.length) return jsonResponse({ error: "missing_cart_payload" }, 400);

    let lastError: JsonRecord | null = null;
    for (const payload of payloads) {
      const response = await fetch(`${UPZERO_API_BASE}/v1/cart/batch`, {
        body: JSON.stringify(payload),
        headers: upzeroHeaders(req, accessToken, true),
        method: "POST",
      }).catch(() => null);

      if (!response) {
        lastError = { error: "upzero_cart_request_failed" };
        continue;
      }

      const parsed = await readJsonOrText(response);
      if (response.ok) return jsonResponse(asRecord(parsed), response.status);

      lastError = {
        error: "upzero_cart_api_failed",
        message:
          clean(asRecord(parsed).message) ||
          clean(asRecord(parsed).error) ||
          `upzero_cart_http_${response.status}`,
        upstream_status: response.status,
      };
    }

    return jsonResponse(lastError || { error: "upzero_cart_api_failed" }, 502);
  }

  return jsonResponse({ error: "unsupported_action" }, 400);
});
