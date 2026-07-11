import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import {
  normalizeUpzeroBaseUrl,
  readUpzeroJsonOrText,
  upzeroFetch,
  upzeroProxyHeaders,
} from "@/lib/upzero";

// Ported from supabase/functions/upzero-storefront-proxy. PUBLIC route (no
// JWT): the widget running on the merchant's storefront calls it, gated by
// store status, integration status and the request's Origin/Referer host.

type JsonRecord = Record<string, unknown>;

const BodySchema = z.object({
  action: z
    .string()
    .optional()
    .describe("One of customer_status | cart_batch."),
  store_id: z.string().optional().describe("Luup store id."),
  payload: z.unknown().optional().describe("Single cart_batch payload."),
  payloads: z
    .array(z.unknown())
    .optional()
    .describe("cart_batch payloads, tried in order until one succeeds."),
});

// Both our own gate errors and the upstream pass-through bodies flow out of
// this route, so every declared status is a loose record instead of the edge
// `{ error }` shape.
const passthroughSchema = z
  .record(z.string(), z.unknown())
  .describe("Upzero upstream response (passed through) or a gate error code.");

export const UpzeroStorefrontProxySchema = {
  schema: {
    summary: "Proxy Upzero storefront calls for the widget",
    description:
      "Public endpoint the widget uses to reach the Upzero storefront API with the store's " +
      "API key. Supports the `customer_status` (GET /v1/clients/me) and `cart_batch` " +
      "(POST /v1/cart/batch) actions. Requires an active store and an active Upzero " +
      "integration, and the request's Origin/Referer host must match the store's configured " +
      "domains (or be an internal Luup host). Upstream status and JSON are passed through.",
    tags: ["upzero", "widget"],
    operationId: "upzeroStorefrontProxy",
    body: BodySchema,
    response: {
      200: passthroughSchema,
      400: passthroughSchema,
      401: passthroughSchema,
      403: passthroughSchema,
      404: passthroughSchema,
      424: passthroughSchema,
      500: passthroughSchema,
      502: passthroughSchema,
    },
  },
};

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
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function requestHostname(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (origin) return normalizedHostname(origin);

  const referer = request.headers.referer;
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

function hostAllowed(
  request: FastifyRequest,
  store: { url: string | null },
  integration: { settings: unknown },
) {
  const hostname = requestHostname(request);
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

export async function upzeroStorefrontProxyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const action = clean(body.action);
  const storeId = clean(body.store_id);
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, slug: true, url: true, platform: true, status: true },
  });

  if (!store) return reply.status(404).send({ error: "store_not_found" });
  if (store.status && store.status !== "active") {
    return reply.status(403).send({ error: "store_not_active" });
  }

  const integration = await prisma.integration.findUnique({
    where: { store_id_provider: { store_id: storeId, provider: "upzero" } },
    select: {
      id: true,
      provider: true,
      status: true,
      settings: true,
      external_store_id: true,
    },
  });

  if (!integration) {
    return reply.status(404).send({ error: "upzero_integration_not_found" });
  }
  if (["disabled", "inactive", "disconnected"].includes(clean(integration.status))) {
    return reply.status(403).send({ error: "upzero_integration_not_active" });
  }

  if (!hostAllowed(request, store, integration)) {
    return reply.status(403).send({ error: "origin_not_allowed" });
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { integration_id: integration.id },
    select: { access_token: true },
  });

  const accessToken = clean(secret?.access_token);
  if (!accessToken) return reply.status(424).send({ error: "upzero_secret_missing" });

  const baseUrl = normalizeUpzeroBaseUrl(null);
  const authorization = request.headers.authorization || "";

  if (action === "customer_status") {
    const response = await upzeroFetch(
      `${baseUrl}/v1/clients/me`,
      { headers: upzeroProxyHeaders(accessToken, { authorization }) },
      null,
    ).catch(() => null);

    if (!response) {
      return reply.status(502).send({ error: "upzero_client_status_failed" });
    }
    const parsed = await readUpzeroJsonOrText(response);
    return reply.status(response.status).send(asRecord(parsed));
  }

  if (action === "cart_batch") {
    const payloads = Array.isArray(body.payloads)
      ? body.payloads
      : body.payload
        ? [body.payload]
        : [];

    if (!payloads.length) {
      return reply.status(400).send({ error: "missing_cart_payload" });
    }

    let lastError: JsonRecord | null = null;
    for (const payload of payloads) {
      const response = await upzeroFetch(
        `${baseUrl}/v1/cart/batch`,
        {
          body: JSON.stringify(payload),
          headers: upzeroProxyHeaders(accessToken, { authorization, hasBody: true }),
          method: "POST",
        },
        null,
      ).catch(() => null);

      if (!response) {
        lastError = { error: "upzero_cart_request_failed" };
        continue;
      }

      const parsed = await readUpzeroJsonOrText(response);
      if (response.ok) return reply.status(response.status).send(asRecord(parsed));

      lastError = {
        error: "upzero_cart_api_failed",
        message:
          clean(asRecord(parsed).message) ||
          clean(asRecord(parsed).error) ||
          `upzero_cart_http_${response.status}`,
        upstream_status: response.status,
      };
    }

    return reply.status(502).send(lastError || { error: "upzero_cart_api_failed" });
  }

  return reply.status(400).send({ error: "unsupported_action" });
}
