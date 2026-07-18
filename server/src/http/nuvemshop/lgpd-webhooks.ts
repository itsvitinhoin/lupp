import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { asRecord } from "@/lib/text";

// Ported from supabase/functions/nuvemshop-lgpd-webhooks. Public route —
// Nuvemshop signs the RAW request body with HMAC-SHA256 (client secret), so
// the route's content-type parser keeps the body as the original string and
// this handler parses it only after the signature check.
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

const ParamsSchema = z.object({
  event: z
    .string()
    .describe("Webhook route: store-redact | customers-redact | customers-data-request."),
});

export const NuvemshopLgpdWebhookSchema = {
  schema: {
    summary: "Nuvemshop LGPD webhook",
    description:
      "Receives Nuvemshop LGPD compliance events (store/redact, customers/redact, " +
      "customers/data_request), authenticated by the x-linkedstore-hmac-sha256 " +
      "signature over the raw body. Every event is logged to " +
      "integration_webhook_events; store/redact additionally deletes the " +
      "integration secret and marks the integration as redacted.",
    tags: ["nuvemshop"],
    operationId: "nuvemshopLgpdWebhook",
    params: ParamsSchema,
    response: {
      200: z.object({ ok: z.boolean() }),
      ...edgeErrorSchemas,
    },
  },
};

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Same case-insensitive hex comparison as the original, constant time.
function safeEqual(expected: string, received: string) {
  const a = Buffer.from(expected.trim().toLowerCase());
  const b = Buffer.from(received.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyNuvemshopSignature(
  request: FastifyRequest,
  rawBody: string,
  clientSecret: string,
) {
  const receivedHmac =
    headerValue(request.headers["x-linkedstore-hmac-sha256"]) ||
    headerValue(request.headers["http_x_linkedstore_hmac_sha256"]) ||
    "";

  if (!receivedHmac) return false;

  const expectedHmac = createHmac("sha256", clientSecret).update(rawBody).digest("hex");
  return safeEqual(expectedHmac, receivedHmac);
}

function getStoreId(payload: WebhookPayload) {
  if (payload.store_id === undefined || payload.store_id === null) return null;
  return String(payload.store_id);
}

export async function nuvemshopLgpdWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const params = ParamsSchema.parse(request.params ?? {});
  const event = routeEvents[params.event];
  if (!event) return reply.status(404).send({ error: "unknown_lgpd_webhook" });

  const clientSecret = env.NUVEMSHOP_CLIENT_SECRET;
  if (!clientSecret) {
    return reply.status(500).send({ error: "missing_server_config" });
  }

  const rawBody = typeof request.body === "string" ? request.body : "";
  if (!verifyNuvemshopSignature(request, rawBody, clientSecret)) {
    return reply.status(401).send({ error: "invalid_signature" });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as WebhookPayload;
  } catch {
    return reply.status(400).send({ error: "invalid_json" });
  }

  const externalStoreId = getStoreId(payload);

  let webhookEvent: { id: string };
  try {
    webhookEvent = await prisma.integrationWebhookEvent.create({
      data: {
        event,
        external_store_id: externalStoreId,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        provider: "nuvemshop",
        status: "received",
      },
      select: { id: true },
    });
  } catch {
    return reply.status(500).send({ error: "webhook_log_failed" });
  }

  try {
    if (event === "store/redact" && externalStoreId) {
      const integration = await prisma.integration.findUnique({
        where: {
          provider_external_store_id: {
            provider: "nuvemshop",
            external_store_id: externalStoreId,
          },
        },
        select: { id: true, settings: true },
      });

      if (integration?.id) {
        await prisma.integrationSecret.deleteMany({
          where: { integration_id: integration.id },
        });
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            credentials: {},
            settings: {
              ...asRecord(integration.settings),
              redacted_at: new Date().toISOString(),
              redaction_event: event,
            },
            status: "redacted",
          },
        });
      }
    }

    await prisma.integrationWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processed_at: new Date(), status: "processed" },
    });

    return reply.status(200).send({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await prisma.integrationWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: message, processed_at: new Date(), status: "failed" },
    });

    return reply.status(500).send({ error: "webhook_processing_failed" });
  }
}
