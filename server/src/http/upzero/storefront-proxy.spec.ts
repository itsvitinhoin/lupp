import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { Prisma } from "../../../generated/prisma/client";
import { UpzeroRoutes } from "./routes";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function seedIntegration(
  storeId: string,
  overrides: { status?: string; withSecret?: boolean; settings?: Record<string, unknown> } = {},
) {
  const integration = await prisma.integration.create({
    data: {
      store_id: storeId,
      provider: "upzero",
      status: overrides.status ?? "active",
      credentials: {},
      settings: (overrides.settings ?? {
        base_url: "https://api.upzero.com.br",
        storefront_url: "https://loja.example.com",
      }) as Prisma.InputJsonValue,
      external_store_id: `upzero:${storeId}`,
      connected_at: new Date(),
    },
  });

  if (overrides.withSecret !== false) {
    await prisma.integrationSecret.create({
      data: {
        integration_id: integration.id,
        provider: "upzero",
        external_store_id: `upzero:${storeId}`,
        access_token: "upzero-key-123",
        token_type: "api_key",
      },
    });
  }

  return integration;
}

describe("POST /api/widget/upzero-proxy (e2e, public)", () => {
  beforeAll(async () => {
    // The orchestrator wires UpzeroRoutes into src/routes.ts; register locally
    // only while that aggregation has not happened yet.
    const routesSource = readFileSync(
      new URL("../../routes.ts", import.meta.url),
      "utf8",
    );
    if (!routesSource.includes("UpzeroRoutes")) {
      await app.register(UpzeroRoutes);
    }
    await app.ready();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("rejects a missing store_id", async () => {
    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("returns 404 for an unknown store", async () => {
    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: randomUUID() });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "store_not_found" });
  });

  it("rejects a store that is not active", async () => {
    const { store } = await createStore({ status: "paused" });
    await seedIntegration(store.id);

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_not_active" });
  });

  it("returns 404 when the store has no Upzero integration", async () => {
    const { store } = await createStore();

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "upzero_integration_not_found" });
  });

  it("rejects a disabled integration", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id, { status: "disabled" });

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "upzero_integration_not_active" });
  });

  it("rejects an origin that matches neither the store domains nor an internal host", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .set("Origin", "https://evil.com")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "origin_not_allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 424 when the integration has no stored API key", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id, { withSecret: false });

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(424);
    expect(response.body).toEqual({ error: "upzero_secret_missing" });
  });

  it("rejects an unsupported action", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "checkout", store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "unsupported_action" });
  });

  it("proxies customer_status from an allowed storefront origin, forwarding the visitor token", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ authenticated: true, client: { id: 9 } }),
    );

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .set("Origin", "https://www.loja.example.com")
      .set("Authorization", "Bearer visitor-token")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true, client: { id: 9 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.upzero.com.br/v1/clients/me");
    expect(init.method).toBeUndefined();
    expect(init.headers["X-API-Key"]).toBe("upzero-key-123");
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer visitor-token");
  });

  it("passes the upstream customer_status status code through", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "session expired" }, 401),
    );

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "customer_status", store_id: store.id });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "session expired" });
  });

  it("requires a payload for cart_batch", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "cart_batch", store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_cart_payload" });
  });

  it("proxies cart_batch to the Upzero cart endpoint", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ ok: true, cart_id: "c1" }),
    );
    const payload = { items: [{ variant_id: 5001, qty: 1 }] };

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({ action: "cart_batch", store_id: store.id, payloads: [payload] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, cart_id: "c1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.upzero.com.br/v1/cart/batch");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("upzero-key-123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it("tries each cart_batch payload and reports the last upstream failure", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "out of stock" }, 422),
    );

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({
        action: "cart_batch",
        store_id: store.id,
        payloads: [{ items: [1] }, { items: [2] }],
      });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "upzero_cart_api_failed",
      message: "out of stock",
      upstream_status: 422,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a single `payload` for cart_batch", async () => {
    const { store } = await createStore();
    await seedIntegration(store.id);
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    const response = await request(app.server)
      .post("/api/widget/upzero-proxy")
      .send({
        action: "cart_batch",
        store_id: store.id,
        payload: { items: [{ variant_id: 1, qty: 2 }] },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
