import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { resolveShopifyAppConfig } from "../_shared/shopify-app-config.ts";

type ShopifyComplianceEvent =
  | "customers/data_request"
  | "customers/redact"
  | "shop/redact";

type ShopifyCompliancePayload = {
  shop_domain?: string;
  shop_id?: number | string;
  customer?: {
    email?: string;
    id?: number | string;
    phone?: string;
  };
  orders_requested?: number[];
  [key: string]: unknown;
};

const routeEvents: Record<string, ShopifyComplianceEvent> = {
  "customers-data-request": "customers/data_request",
  "customers-redact": "customers/redact",
  "shop-redact": "shop/redact",
};

const jsonHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-shopify-hmac-sha256, x-shopify-shop-domain, x-shopify-topic",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: jsonHeaders,
    status,
  });
}

function getEventFromRequest(req: Request) {
  const headerTopic = req.headers.get("x-shopify-topic")?.trim() as
    | ShopifyComplianceEvent
    | undefined;
  if (headerTopic && Object.values(routeEvents).includes(headerTopic))
    return headerTopic;

  const pathnameParts = new URL(req.url).pathname.split("/").filter(Boolean);
  const route = pathnameParts[pathnameParts.length - 1] || "";
  return routeEvents[route];
}

function toBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function hmacSha256Base64(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return toBase64(signature);
}

function safeEqual(expected: string, received: string) {
  const normalizedExpected = expected.trim();
  const normalizedReceived = received.trim();
  if (normalizedExpected.length !== normalizedReceived.length) return false;

  let result = 0;
  for (let index = 0; index < normalizedExpected.length; index += 1) {
    result |=
      normalizedExpected.charCodeAt(index) ^
      normalizedReceived.charCodeAt(index);
  }
  return result === 0;
}

async function verifyShopifyWebhookSignature(
  req: Request,
  rawBody: string,
  apiSecret: string,
) {
  const receivedHmac = req.headers.get("x-shopify-hmac-sha256") || "";
  if (!receivedHmac) return false;

  const expectedHmac = await hmacSha256Base64(rawBody, apiSecret);
  return safeEqual(expectedHmac, receivedHmac);
}

function normalizeShopDomain(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!trimmed.endsWith(".myshopify.com")) return null;
  return trimmed;
}

function getShopDomain(req: Request, payload: ShopifyCompliancePayload) {
  return (
    normalizeShopDomain(req.headers.get("x-shopify-shop-domain")) ||
    normalizeShopDomain(payload.shop_domain) ||
    (payload.shop_id === undefined || payload.shop_id === null
      ? null
      : String(payload.shop_id))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const rawBody = await req.text();
  const appConfig = resolveShopifyAppConfig({
    shop: req.headers.get("x-shopify-shop-domain"),
  });
  if (!appConfig) {
    return jsonResponse({ error: "missing_shopify_app_config" }, 500);
  }

  const signatureIsValid = await verifyShopifyWebhookSignature(
    req,
    rawBody,
    appConfig.apiSecret,
  );
  if (!signatureIsValid) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  const event = getEventFromRequest(req);
  if (!event) {
    return jsonResponse({ error: "unknown_shopify_compliance_webhook" }, 404);
  }

  let payload: ShopifyCompliancePayload;
  try {
    payload = JSON.parse(rawBody || "{}") as ShopifyCompliancePayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const externalStoreId = getShopDomain(req, payload);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: webhookEvent, error: webhookEventError } = await supabase
    .from("integration_webhook_events")
    .insert({
      event,
      external_store_id: externalStoreId,
      payload,
      provider: "shopify",
      status: "received",
    })
    .select("id")
    .single();

  if (webhookEventError || !webhookEvent) {
    return jsonResponse({ error: "webhook_log_failed" }, 500);
  }

  try {
    if (event === "shop/redact" && externalStoreId) {
      const { data: integrations, error: integrationsError } = await supabase
        .from("integrations")
        .select("id, settings")
        .eq("provider", "shopify")
        .eq("external_store_id", externalStoreId);

      if (integrationsError) throw integrationsError;

      for (const integration of integrations ?? []) {
        const settings =
          integration.settings &&
          typeof integration.settings === "object" &&
          !Array.isArray(integration.settings)
            ? integration.settings
            : {};

        await supabase
          .from("integration_secrets")
          .delete()
          .eq("integration_id", integration.id);
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            credentials: {},
            settings: {
              ...settings,
              redacted_at: new Date().toISOString(),
              redaction_event: event,
            },
            status: "redacted",
          })
          .eq("id", integration.id);

        if (updateError) throw updateError;
      }
    }

    await supabase
      .from("integration_webhook_events")
      .update({ processed_at: new Date().toISOString(), status: "processed" })
      .eq("id", webhookEvent.id);

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabase
      .from("integration_webhook_events")
      .update({
        error: message,
        processed_at: new Date().toISOString(),
        status: "failed",
      })
      .eq("id", webhookEvent.id);

    return jsonResponse({ error: "webhook_processing_failed" }, 500);
  }
});
