import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { ShopifyRoutes } from "./routes";
import { createStore } from "../../../test/utils/create-store";

// Shopify env must exist before "@/app" (and its env module) is imported —
// vi.hoisted runs before the static imports above.
const TEST_ENV = vi.hoisted(() => {
  process.env.SHOPIFY_API_KEY = "test-shopify-api-key";
  process.env.SHOPIFY_API_SECRET = "test-shopify-api-secret";
  return { apiSecret: "test-shopify-api-secret" };
});

const ROUTE = "/api/webhooks/shopify-compliance";

function webhookHmac(rawBody: string, secret = TEST_ENV.apiSecret) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

function sendWebhook(options: {
  path?: string;
  body: Record<string, unknown>;
  topic?: string;
  shopDomain?: string;
  hmac?: string;
}) {
  const rawBody = JSON.stringify(options.body);
  let req = request(app.server)
    .post(options.path ?? ROUTE)
    .set("content-type", "application/json")
    .set("x-shopify-hmac-sha256", options.hmac ?? webhookHmac(rawBody));
  if (options.topic) req = req.set("x-shopify-topic", options.topic);
  if (options.shopDomain) {
    req = req.set("x-shopify-shop-domain", options.shopDomain);
  }
  return req.send(rawBody);
}

describe("POST /api/webhooks/shopify-compliance (e2e)", () => {
  beforeAll(async () => {
    app.register(ShopifyRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an invalid signature without logging anything", async () => {
    const response = await sendWebhook({
      body: { shop_domain: "victim.myshopify.com" },
      topic: "customers/data_request",
      hmac: webhookHmac("{}", "wrong-secret"),
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_signature" });

    const events = await prisma.integrationWebhookEvent.findMany({
      where: { external_store_id: "victim.myshopify.com" },
    });
    expect(events).toHaveLength(0);
  });

  it("rejects an unknown topic with 404", async () => {
    const response = await sendWebhook({
      body: { shop_domain: "any.myshopify.com" },
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "unknown_shopify_compliance_webhook",
    });
  });

  it("logs a customers/data_request event (topic from header)", async () => {
    const shop = "data-request.myshopify.com";
    const response = await sendWebhook({
      body: {
        shop_domain: shop,
        customer: { id: 42, email: "c@example.com" },
        orders_requested: [1, 2],
      },
      topic: "customers/data_request",
      shopDomain: shop,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const event = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "shopify", external_store_id: shop },
    });
    expect(event.event).toBe("customers/data_request");
    expect(event.status).toBe("processed");
    expect(event.processed_at).not.toBeNull();
    expect(event.payload).toMatchObject({
      customer: { id: 42, email: "c@example.com" },
      orders_requested: [1, 2],
    });
  });

  it("derives the topic from the path segment", async () => {
    const shop = "path-topic.myshopify.com";
    const response = await sendWebhook({
      path: `${ROUTE}/customers-redact`,
      body: { shop_domain: shop, customer: { id: 7 } },
      shopDomain: shop,
    });

    expect(response.status).toBe(200);

    const event = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "shopify", external_store_id: shop },
    });
    expect(event.event).toBe("customers/redact");
    expect(event.status).toBe("processed");
  });

  it("shop/redact deletes secrets and marks the integration redacted", async () => {
    const shop = "redact-me.myshopify.com";
    const { store } = await createStore();
    const integration = await prisma.integration.create({
      data: {
        store_id: store.id,
        provider: "shopify",
        status: "active",
        external_store_id: shop,
        credentials: { token_type: "bearer" },
        settings: { connected_via: "oauth", shop_domain: shop },
      },
    });
    await prisma.integrationSecret.create({
      data: {
        integration_id: integration.id,
        provider: "shopify",
        external_store_id: shop,
        access_token: "shpat_to_be_deleted",
      },
    });

    const response = await sendWebhook({
      path: `${ROUTE}/shop-redact`,
      body: { shop_domain: shop, shop_id: 555 },
      shopDomain: shop,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const secret = await prisma.integrationSecret.findUnique({
      where: { integration_id: integration.id },
    });
    expect(secret).toBeNull();

    const redacted = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(redacted.status).toBe("redacted");
    expect(redacted.credentials).toEqual({});
    expect(redacted.settings).toMatchObject({
      connected_via: "oauth",
      redaction_event: "shop/redact",
    });
    expect(
      (redacted.settings as { redacted_at?: string }).redacted_at,
    ).toBeTruthy();

    const event = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "shopify", external_store_id: shop },
    });
    expect(event.event).toBe("shop/redact");
    expect(event.status).toBe("processed");
  });
});
