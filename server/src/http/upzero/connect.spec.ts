import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";
import { UpzeroRoutes } from "./routes";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("POST /api/integrations/upzero/connect (e2e)", () => {
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

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .send({ store_id: "any", apiKey: "key" });

    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id and a missing API key with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const missingStore = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "key" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const missingKey = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: "some-store" });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ error: "missing_upzero_api_key" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, apiKey: "upzero-key-123" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns 401 when both Upzero endpoints reject the key as unauthorized", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "invalid api key" }, 401),
    );

    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, apiKey: "bad-key" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("upzero_connection_test_failed");
    expect(response.body.attempts).toHaveLength(2);
    expect(response.body.attempts[0].source).toBe("storefront");
    expect(response.body.attempts[1].source).toBe("external");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the connection test fails for another reason", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ message: "boom" }, 500),
    );

    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, apiKey: "upzero-key-123" });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("upzero_connection_test_failed");
  });

  it("connects via the storefront endpoint, persisting integration, secret and platform", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ items: [{ product: { id: 1 } }] }),
    );

    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        apiKey: "upzero-key-123",
        storefrontUrl: "https://loja.example.com/",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      products_previewed: 1,
      source: "storefront",
    });

    const [testUrl, testInit] = fetchMock.mock.calls[0];
    expect(String(testUrl)).toBe(
      "https://api.upzero.com.br/v1/products?limit=1&card_mode=true&include_variants=false",
    );
    expect(testInit.headers["X-API-Key"]).toBe("upzero-key-123");

    const integration = await prisma.integration.findUniqueOrThrow({
      where: { store_id_provider: { store_id: store.id, provider: "upzero" } },
    });
    expect(integration.status).toBe("active");
    expect(integration.external_store_id).toBe(`upzero:${store.id}`);
    expect(integration.connected_at).not.toBeNull();
    expect(integration.settings).toMatchObject({
      base_url: "https://api.upzero.com.br",
      connected_via: "api_key",
      integration_name: null,
      last_connection_source: "storefront",
      product_url_pattern: "/produtos/{code}-{name_slug}",
      storefront_url: "https://loja.example.com",
    });

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
    expect(secret.access_token).toBe("upzero-key-123");
    expect(secret.token_type).toBe("api_key");
    expect(secret.scope).toBe("storefront:products external:products");
    expect(secret.external_store_id).toBe(`upzero:${store.id}`);
    expect(secret.metadata).toMatchObject({ source: "storefront" });

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { platform: true },
    });
    expect(updatedStore.platform).toBe("upzero");
  });

  it("falls back to the external endpoint (with the integration name) when the storefront test fails", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/external/v1/products")) {
        return jsonResponse({ data: [{ id: "p1" }, { id: "p2" }] });
      }
      return jsonResponse({ message: "storefront disabled" }, 403);
    });

    const response = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({
        store_id: store.id,
        api_key: "upzero-key-123",
        integrationName: "parceiro",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      products_previewed: 2,
      source: "external",
    });

    const [externalUrl] = fetchMock.mock.calls[1];
    expect(String(externalUrl)).toBe(
      "https://api.upzero.com.br/external/v1/products?limit=1&integration=parceiro",
    );

    const integration = await prisma.integration.findUniqueOrThrow({
      where: { store_id_provider: { store_id: store.id, provider: "upzero" } },
    });
    expect(integration.settings).toMatchObject({
      integration_name: "parceiro",
      last_connection_source: "external",
    });
  });

  it("re-connecting updates the existing integration instead of duplicating it", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(async () => jsonResponse({ items: [] }));

    const first = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, apiKey: "old-key" });
    expect(first.status).toBe(200);

    const second = await request(app.server)
      .post("/api/integrations/upzero/connect")
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id, apiKey: "new-key" });
    expect(second.status).toBe(200);

    const integrations = await prisma.integration.findMany({
      where: { store_id: store.id, provider: "upzero" },
    });
    expect(integrations).toHaveLength(1);

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integrations[0].id },
    });
    expect(secret.access_token).toBe("new-key");
  });
});
