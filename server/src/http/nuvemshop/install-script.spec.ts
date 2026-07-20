import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { prisma } from "@/lib/prisma";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const INSTALL_PATH = "/api/integrations/nuvemshop/install-script";

function scriptsBase(externalStoreId: string) {
  return `https://api.tiendanube.com/2025-03/${externalStoreId}/scripts`;
}

async function seedConnectedStore(externalStoreId: string) {
  const { owner, store } = await createStore();
  await prisma.store.update({
    where: { id: store.id },
    data: { url: "https://loja.example.com" },
  });
  const integration = await prisma.integration.create({
    data: {
      store_id: store.id,
      provider: "nuvemshop",
      status: "active",
      external_store_id: externalStoreId,
      settings: { app_id: "36726" },
    },
  });
  await prisma.integrationSecret.create({
    data: {
      integration_id: integration.id,
      provider: "nuvemshop",
      external_store_id: externalStoreId,
      access_token: "shop-token",
      token_type: "bearer",
    },
  });
  return { owner, store, integration };
}

describe("POST /api/integrations/nuvemshop/install-script (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NUVEMSHOP_SCRIPT_ID;
    delete process.env.NUVEMSHOP_SCRIPT_AUTO_INSTALL;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const response = await request(app.server).post(INSTALL_PATH).send({ store_id: "any" });
    expect(response.status).toBe(401);
  });

  it("rejects a missing store_id", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "missing_store_id" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("returns nuvemshop_not_connected when there is no active integration", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "nuvemshop_not_connected" });
  });

  it("installs the portal script (POST), verifies it and records script_install", async () => {
    process.env.NUVEMSHOP_SCRIPT_ID = "555";
    const { owner, store, integration } = await seedConnectedStore("424101");
    const base = scriptsBase("424101");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    let listCalls = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith(`${base}?`) && method === "GET") {
        listCalls += 1;
        // First list: nothing installed; verification list: script live.
        const body =
          listCalls === 1
            ? []
            : [{ id: 999, script_id: 555, handle: "lupp", status: "active" }];
        return new Response(JSON.stringify(body), { status: 200 });
      }
      if (url === base && method === "POST") {
        return new Response(JSON.stringify({ id: 999, status: "active" }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      installed: true,
      installation_id: "555",
      method: "POST:query_params_object",
      ok: true,
      script_id: "555",
      verified: true,
    });
    expect(response.body.verified_script).toMatchObject({ id: 999, handle: "lupp" });

    // The install POST carried the widget query params + portal script id.
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === base && (init as RequestInit)?.method === "POST",
    );
    const postBody = JSON.parse(String((postCall![1] as RequestInit).body));
    expect(postBody.script_id).toBe(555);
    expect(postBody.query_params).toMatchObject({
      external_store_id: "424101",
      lupp_store: store.slug,
      lupp_store_domain: "https://loja.example.com",
      lupp_widget: "floating_launcher",
      lupp_require_active: "true",
    });

    const updated = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
      select: { settings: true },
    });
    const settings = updated.settings as {
      app_id: string;
      script_install: Record<string, unknown>;
    };
    expect(settings.app_id).toBe("36726");
    expect(settings.script_install).toMatchObject({
      auto_installed: false,
      external_store_id: "424101",
      installation_id: "555",
      script_id: "555",
      source: "nuvemshop_public_api",
      status: "active",
      verified: true,
    });
  });

  it("updates an existing Luup script with PUT", async () => {
    process.env.NUVEMSHOP_SCRIPT_ID = "555";
    const { owner, store } = await seedConnectedStore("424102");
    const base = scriptsBase("424102");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const existingScript = { id: 999, script_id: 555, handle: "lupp", status: "active" };
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith(`${base}?`) && method === "GET") {
        return new Response(JSON.stringify([existingScript]), { status: 200 });
      }
      if (url === `${base}/999` && method === "PUT") {
        return new Response(JSON.stringify({ id: 999, status: "active" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      installed: true,
      installation_id: "999",
      method: "PUT:query_params_object",
      verified: true,
    });
  });

  it("treats an active auto-installed script as terminal success without write attempts", async () => {
    // Real-world shape: portal script with "Instalação automática" ON. The
    // Scripts API rejects POST (422 "Does not support store association") and
    // PUT (404 — no association row), so the active listing must be enough.
    process.env.NUVEMSHOP_SCRIPT_ID = "8514";
    const { owner, store, integration } = await seedConnectedStore("424104");
    const base = scriptsBase("424104");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith(`${base}?`) && method === "GET") {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 8514,
                name: "Luup Video Experience",
                event: "onfirstinteraction",
                location: "store",
                is_auto_install: true,
                status: "active",
              },
            ],
            total: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          message: "Script is auto installed. Does not support store association ",
          error: "Unprocessable Entity",
          statusCode: 422,
        }),
        { status: 422 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      auto_installed: true,
      installed: true,
      method: "AUTO_INSTALL_VERIFIED",
      ok: true,
      script_id: "8514",
      verified: true,
    });
    expect(response.body.existing_script).toMatchObject({ id: 8514, is_auto_install: true });

    // Only the list call — no POST/PUT was attempted.
    const writeCalls = fetchMock.mock.calls.filter(
      ([, init]) => ((init as RequestInit)?.method ?? "GET") !== "GET",
    );
    expect(writeCalls).toHaveLength(0);

    const updated = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
      select: { settings: true },
    });
    expect((updated.settings as { script_install: Record<string, unknown> }).script_install).toMatchObject({
      installation_id: "8514",
      source: "nuvemshop_app_auto_install",
      status: "active",
      verified: true,
    });
  });

  it("reports auto-install as not confirmed (409) when Nuvemshop lists no script", async () => {
    const { owner, store, integration } = await seedConnectedStore("424103");
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    );

    const response = await request(app.server)
      .post(INSTALL_PATH)
      .set("Authorization", `Bearer ${token}`)
      .send({ store_id: store.id });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      auto_installed: false,
      error: "nuvemshop_script_install_not_confirmed",
      installed: false,
      pending_manual_install: true,
      verified: false,
    });

    const updated = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
      select: { settings: true },
    });
    expect((updated.settings as { script_install: Record<string, unknown> }).script_install).toMatchObject({
      auto_installed: true,
      script_id: "nuvemshop-auto-install",
      status: "auto_install_not_confirmed",
      verified: false,
    });
  });
});
