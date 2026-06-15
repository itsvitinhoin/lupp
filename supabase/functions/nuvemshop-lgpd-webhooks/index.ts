import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type LgpdEvent = "store/redact" | "customers/redact" | "customers/data_request";

type WebhookPayload = {
  customer?: {
    email?: string;
    id?: number | string;
    identification?: string;
    phone?: string;
  };
  data_request?: {
    id?: number | string;
  };
  event?: string;
  store_id?: number | string;
  [key: string]: unknown;
};

const routeEvents: Record<string, LgpdEvent> = {
  "customers-data-request": "customers/data_request",
  "customers-redact": "customers/redact",
  "store-redact": "store/redact",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return toHex(signature);
}

function safeEqual(expected: string, received: string) {
  const normalizedExpected = expected.trim().toLowerCase();
  const normalizedReceived = received.trim().toLowerCase();
  if (normalizedExpected.length !== normalizedReceived.length) return false;

  let result = 0;
  for (let index = 0; index < normalizedExpected.length; index += 1) {
    result |= normalizedExpected.charCodeAt(index) ^ normalizedReceived.charCodeAt(index);
  }
  return result === 0;
}

function getEventFromRequest(req: Request) {
  const pathnameParts = new URL(req.url).pathname.split("/").filter(Boolean);
  const route = pathnameParts[pathnameParts.length - 1] || "";
  return routeEvents[route];
}

async function verifyNuvemshopSignature(req: Request, rawBody: string, clientSecret: string) {
  const receivedHmac =
    req.headers.get("x-linkedstore-hmac-sha256") ||
    req.headers.get("HTTP_X_LINKEDSTORE_HMAC_SHA256") ||
    "";

  if (!receivedHmac) return false;

  const expectedHmac = await hmacSha256Hex(rawBody, clientSecret);
  return safeEqual(expectedHmac, receivedHmac);
}

function getStoreId(payload: WebhookPayload) {
  if (payload.store_id === undefined || payload.store_id === null) return null;
  return String(payload.store_id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const event = getEventFromRequest(req);
  if (!event) {
    return jsonResponse({ error: "unknown_lgpd_webhook" }, 404);
  }

  const clientSecret = Deno.env.get("NUVEMSHOP_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!clientSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_server_config" }, 500);
  }

  const rawBody = await req.text();
  const signatureIsValid = await verifyNuvemshopSignature(req, rawBody, clientSecret);
  if (!signatureIsValid) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as WebhookPayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const externalStoreId = getStoreId(payload);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: webhookEvent, error: webhookEventError } = await supabase
    .from("integration_webhook_events")
    .insert({
      event,
      external_store_id: externalStoreId,
      payload,
      provider: "nuvemshop",
      status: "received",
    })
    .select("id")
    .single();

  if (webhookEventError || !webhookEvent) {
    return jsonResponse({ error: "webhook_log_failed" }, 500);
  }

  try {
    if (event === "store/redact" && externalStoreId) {
      const { data: integration } = await supabase
        .from("integrations")
        .select("id, settings")
        .eq("provider", "nuvemshop")
        .eq("external_store_id", externalStoreId)
        .maybeSingle();

      if (integration?.id) {
        const settings =
          integration.settings && typeof integration.settings === "object" && !Array.isArray(integration.settings)
            ? integration.settings
            : {};

        await supabase.from("integration_secrets").delete().eq("integration_id", integration.id);
        await supabase
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
      .update({ error: message, processed_at: new Date().toISOString(), status: "failed" })
      .eq("id", webhookEvent.id);

    return jsonResponse({ error: "webhook_processing_failed" }, 500);
  }
});
