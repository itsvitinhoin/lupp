import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";

const CLIENT_SECRET = "test-client-secret";
const WEBHOOK_BASE = "/api/webhooks/nuvemshop-lgpd";

function sign(rawBody: string, secret = CLIENT_SECRET) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function postWebhook(event: string, rawBody: string, hmac?: string) {
  const req = request(app.server)
    .post(`${WEBHOOK_BASE}/${event}`)
    .set("Content-Type", "application/json");
  if (hmac !== undefined) req.set("x-linkedstore-hmac-sha256", hmac);
  return req.send(rawBody);
}

async function seedConnectedStore(externalStoreId: string) {
  const { store } = await createStore();
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "nuvemshop",
      status: "active",
      external_store_id: externalStoreId,
      credentials: { token_type: "bearer" },
      settings: { app_id: "34355" },
    },
  });
  await prisma.integrationSecret.create({
    data: {
      integration_id: integration.id,
      provider: "nuvemshop",
      external_store_id: externalStoreId,
      access_token: "shop-token",
    },
  });
  return { store, integration };
}

describe("POST /api/webhooks/nuvemshop-lgpd/:event (e2e)", () => {
  beforeAll(async () => {
    env.NUVEMSHOP_CLIENT_SECRET = CLIENT_SECRET;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 404 for an unknown LGPD route", async () => {
    const response = await postWebhook("something-else", "{}");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "unknown_lgpd_webhook" });
  });

  it("rejects a missing signature", async () => {
    const response = await postWebhook("store-redact", JSON.stringify({ store_id: 1 }));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_signature" });
  });

  it("rejects an invalid signature", async () => {
    const rawBody = JSON.stringify({ store_id: 1 });
    const response = await postWebhook("store-redact", rawBody, sign(rawBody, "wrong-secret"));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_signature" });
  });

  it("rejects invalid JSON only after the signature verifies", async () => {
    const rawBody = "{not json";
    const response = await postWebhook("store-redact", rawBody, sign(rawBody));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_json" });
  });

  it("store/redact deletes the secret, marks the integration redacted and logs the event", async () => {
    const { integration } = await seedConnectedStore("909090");
    const rawBody = JSON.stringify({ store_id: 909090 });

    const response = await postWebhook("store-redact", rawBody, sign(rawBody));

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
      app_id: "34355",
      redaction_event: "store/redact",
    });
    expect((redacted.settings as { redacted_at: string }).redacted_at).toBeTruthy();

    const webhookEvent = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "nuvemshop", external_store_id: "909090" },
    });
    expect(webhookEvent.event).toBe("store/redact");
    expect(webhookEvent.status).toBe("processed");
    expect(webhookEvent.processed_at).not.toBeNull();
    expect(webhookEvent.payload).toMatchObject({ store_id: 909090 });
  });

  it("accepts the signature case-insensitively (uppercase hex)", async () => {
    const rawBody = JSON.stringify({ store_id: 111 });
    const response = await postWebhook(
      "customers-data-request",
      rawBody,
      sign(rawBody).toUpperCase(),
    );
    expect(response.status).toBe(200);
  });

  it("customers/redact only logs the event (no integration changes)", async () => {
    const { integration } = await seedConnectedStore("808080");
    const rawBody = JSON.stringify({
      store_id: 808080,
      customer: { id: 42, email: "shopper@example.com" },
    });

    const response = await postWebhook("customers-redact", rawBody, sign(rawBody));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const untouched = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(untouched.status).toBe("active");
    const secret = await prisma.integrationSecret.findUnique({
      where: { integration_id: integration.id },
    });
    expect(secret).not.toBeNull();

    const webhookEvent = await prisma.integrationWebhookEvent.findFirstOrThrow({
      where: { provider: "nuvemshop", external_store_id: "808080" },
    });
    expect(webhookEvent.event).toBe("customers/redact");
    expect(webhookEvent.status).toBe("processed");
  });
});
