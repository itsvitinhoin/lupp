import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { signNuvemshopState } from "@/lib/nuvemshop";
import { createStore } from "../../../test/utils/create-store";

const STATE_SECRET = "test-state-secret";
const CALLBACK_PATH = "/api/integrations/nuvemshop/oauth/callback";

function signState(storeId: string, userId: string, returnTo?: string) {
  return signNuvemshopState(
    {
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo ?? `${env.LUPP_APP_URL}/app/integrations`,
      store_id: storeId,
      user_id: userId,
    },
    STATE_SECRET,
  );
}

function stubNuvemshopFetch(overrides?: {
  token?: Record<string, unknown> | null;
  tokenStatus?: number;
}) {
  const fetchMock = vi.fn(async (input: unknown, _init?: RequestInit) => {
    const url = String(input);
    if (url === "https://www.tiendanube.com/apps/authorize/token") {
      return new Response(
        JSON.stringify(
          overrides?.token ?? {
            access_token: "nuvemshop-token-123",
            scope: "read_products write_scripts",
            token_type: "bearer",
            user_id: 987654,
          },
        ),
        { status: overrides?.tokenStatus ?? 200 },
      );
    }
    if (url.endsWith("/store")) {
      return new Response(
        JSON.stringify({
          domains: ["loja.example.com"],
          original_domain: "orig.example.com",
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/integrations/nuvemshop/oauth/callback (e2e)", () => {
  beforeAll(async () => {
    env.NUVEMSHOP_STATE_SECRET = STATE_SECRET;
    env.NUVEMSHOP_CLIENT_SECRET = "test-client-secret";
    env.NUVEMSHOP_CLIENT_ID = "";
    env.NUVEMSHOP_APP_ID = "36726";
    await app.ready();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
  });

  it("redirects to the install-retry URL when code or state is missing", async () => {
    const response = await request(app.server).get(CALLBACK_PATH);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${env.LUPP_APP_URL}/app/integrations?connect=nuvemshop&install_retry=1`,
    );
  });

  it("redirects with invalid_oauth_state on a bad state", async () => {
    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", state: "not.valid" });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(location.searchParams.get("error")).toBe("invalid_oauth_state");
    expect(location.searchParams.get("provider")).toBe("nuvemshop");
  });

  it("redirects with nuvemshop_token_exchange_failed when the exchange fails", async () => {
    stubNuvemshopFetch({ token: { error: "invalid_grant" }, tokenStatus: 400 });
    const { owner, store } = await createStore();

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", state: signState(store.id, owner.id) });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "nuvemshop_token_exchange_failed",
    );
  });

  it("connects the store: integration + secret upserted, platform set, domains persisted", async () => {
    const fetchMock = stubNuvemshopFetch();
    const { owner, store } = await createStore();
    const returnTo = `${env.LUPP_APP_URL}/app/integrations`;

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", state: signState(store.id, owner.id, returnTo) });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(returnTo);
    expect(location.searchParams.get("connected")).toBe("nuvemshop");
    expect(location.searchParams.get("provider")).toBe("nuvemshop");

    const integration = await prisma.integration.findUniqueOrThrow({
      where: {
        store_id_provider: { store_id: store.id, provider: "nuvemshop" },
      },
    });
    expect(integration.external_store_id).toBe("987654");
    expect(integration.status).toBe("active");
    expect(integration.connected_at).not.toBeNull();
    expect(integration.credentials).toMatchObject({
      scope: "read_products write_scripts",
      token_type: "bearer",
    });
    expect(integration.settings).toMatchObject({
      app_id: "36726",
      connected_via: "oauth",
      nuvemshop_store_id: "987654",
      nuvemshop_domains: ["loja.example.com"],
      nuvemshop_original_domain: "orig.example.com",
    });

    const secret = await prisma.integrationSecret.findUniqueOrThrow({
      where: { integration_id: integration.id },
    });
    expect(secret.access_token).toBe("nuvemshop-token-123");
    expect(secret.external_store_id).toBe("987654");
    expect(secret.provider).toBe("nuvemshop");
    expect(secret.metadata).toMatchObject({ app_id: "36726" });

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { platform: true },
    });
    expect(updatedStore.platform).toBe("nuvemshop");

    // Token exchange sent the expected grant.
    const tokenCall = fetchMock.mock.calls.find(
      ([url]) => String(url) === "https://www.tiendanube.com/apps/authorize/token",
    );
    expect(tokenCall).toBeTruthy();
    expect(JSON.parse(String(tokenCall![1]?.body))).toMatchObject({
      client_id: "36726",
      client_secret: "test-client-secret",
      code: "abc",
      grant_type: "authorization_code",
    });
  });

  it("refuses to attach a Nuvemshop store already connected to another Luup store", async () => {
    stubNuvemshopFetch({
      token: {
        access_token: "nuvemshop-token-456",
        token_type: "bearer",
        user_id: 555111,
      },
    });
    const { store: firstStore } = await createStore();
    await prisma.integration.create({
      data: {
        store_id: firstStore.id,
        provider: "nuvemshop",
        status: "active",
        external_store_id: "555111",
      },
    });

    const { owner, store: secondStore } = await createStore();
    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", state: signState(secondStore.id, owner.id) });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "luup_integration_save_failed:nuvemshop_store_already_connected_to_another_luup_store",
    );

    // The second store must not have gained an integration.
    const secondIntegration = await prisma.integration.findUnique({
      where: {
        store_id_provider: { store_id: secondStore.id, provider: "nuvemshop" },
      },
    });
    expect(secondIntegration).toBeNull();
  });

  it("rejects an expired state (30-minute TTL)", async () => {
    const { owner, store } = await createStore();
    const staleState = signNuvemshopState(
      {
        iat: Math.floor(Date.now() / 1000) - 60 * 31,
        return_to: `${env.LUPP_APP_URL}/app/integrations`,
        store_id: store.id,
        user_id: owner.id,
      },
      STATE_SECRET,
    );

    const response = await request(app.server)
      .get(CALLBACK_PATH)
      .query({ code: "abc", state: staleState });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.location).searchParams.get("error")).toBe(
      "invalid_oauth_state",
    );
  });
});
