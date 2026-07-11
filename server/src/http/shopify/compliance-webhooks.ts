import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import {
  resolveShopifyAppConfig,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { Prisma } from "../../../generated/prisma/client";

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

// Ported from supabase/functions/shopify-compliance-webhooks. Public: Shopify
// authenticates with x-shopify-hmac-sha256 (base64 HMAC over the RAW body —
// preserved by the scoped content parser in routes.ts). No body schema: JSON
// parsing is deferred to the handler so a bad payload is only rejected AFTER
// the signature check, exactly like the original.
export const ShopifyComplianceWebhooksSchema = {
  schema: {
    summary: "Shopify compliance webhooks",
    description:
      "GDPR/LGPD compliance webhook inbox (customers/data_request, customers/redact, " +
      "shop/redact). Verifies the x-shopify-hmac-sha256 signature over the raw body, logs the " +
      "event to integration_webhook_events, and on shop/redact deletes the integration's " +
      "secrets and marks it redacted. The topic comes from the x-shopify-topic header or the " +
      "path segment.",
    tags: ["shopify"],
    operationId: "shopifyComplianceWebhooks",
    params: z.object({
      event: z
        .string()
        .optional()
        .describe(
          "Route topic: customers-data-request, customers-redact or shop-redact.",
        ),
    }),
    response: {
      200: z.object({ ok: z.boolean() }),
      ...edgeErrorSchemas,
    },
  },
};

function getEventFromRequest(request: FastifyRequest) {
  const headerTopic = String(
    request.headers["x-shopify-topic"] || "",
  ).trim() as ShopifyComplianceEvent;
  if (headerTopic && Object.values(routeEvents).includes(headerTopic)) {
    return headerTopic;
  }

  const params = request.params as { event?: string };
  return routeEvents[params.event || ""];
}

function normalizeShopDomainHeader(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!trimmed.endsWith(".myshopify.com")) return null;
  return trimmed;
}

function getShopDomain(
  request: FastifyRequest,
  payload: ShopifyCompliancePayload,
) {
  return (
    normalizeShopDomainHeader(request.headers["x-shopify-shop-domain"]) ||
    normalizeShopDomainHeader(payload.shop_domain) ||
    (payload.shop_id === undefined || payload.shop_id === null
      ? null
      : String(payload.shop_id))
  );
}

export async function shopifyComplianceWebhooksHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const rawBody = request.rawBody ?? "";
  const appConfig = resolveShopifyAppConfig({
    shop: request.headers["x-shopify-shop-domain"],
  });
  if (!appConfig) {
    return reply.status(500).send({ error: "missing_shopify_app_config" });
  }

  const receivedHmac = String(
    request.headers["x-shopify-hmac-sha256"] || "",
  );
  if (!verifyShopifyWebhookHmac(rawBody, receivedHmac, appConfig.apiSecret)) {
    return reply.status(401).send({ error: "invalid_signature" });
  }

  const event = getEventFromRequest(request);
  if (!event) {
    return reply
      .status(404)
      .send({ error: "unknown_shopify_compliance_webhook" });
  }

  let payload: ShopifyCompliancePayload;
  try {
    payload = JSON.parse(rawBody || "{}") as ShopifyCompliancePayload;
  } catch {
    return reply.status(400).send({ error: "invalid_json" });
  }

  const externalStoreId = getShopDomain(request, payload);

  let webhookEventId = "";
  try {
    const webhookEvent = await prisma.integrationWebhookEvent.create({
      data: {
        event,
        external_store_id: externalStoreId,
        payload: payload as Prisma.InputJsonValue,
        provider: "shopify",
        status: "received",
      },
      select: { id: true },
    });
    webhookEventId = webhookEvent.id;
  } catch {
    return reply.status(500).send({ error: "webhook_log_failed" });
  }

  try {
    if (event === "shop/redact" && externalStoreId) {
      const integrations = await prisma.integration.findMany({
        where: { provider: "shopify", external_store_id: externalStoreId },
        select: { id: true, settings: true },
      });

      for (const integration of integrations) {
        const settings =
          integration.settings &&
          typeof integration.settings === "object" &&
          !Array.isArray(integration.settings)
            ? integration.settings
            : {};

        await prisma.integrationSecret.deleteMany({
          where: { integration_id: integration.id },
        });
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            credentials: {},
            settings: {
              ...settings,
              redacted_at: new Date().toISOString(),
              redaction_event: event,
            },
            status: "redacted",
          },
        });
      }
    }

    await prisma.integrationWebhookEvent.update({
      where: { id: webhookEventId },
      data: { processed_at: new Date(), status: "processed" },
    });

    return reply.status(200).send({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await prisma.integrationWebhookEvent
      .update({
        where: { id: webhookEventId },
        data: {
          error: message,
          processed_at: new Date(),
          status: "failed",
        },
      })
      .catch(() => undefined);

    return reply.status(500).send({ error: "webhook_processing_failed" });
  }
}
