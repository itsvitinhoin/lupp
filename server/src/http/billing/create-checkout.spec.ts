import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const fetchMock = vi.fn();

function validBody(storeId: string) {
  return {
    store_id: storeId,
    plan_id: "pro",
    customer: {
      name: "Joao Souza",
      email: "joao@example.com",
      cpfCnpj: "123.456.789-09",
      phone: "(11) 98888-7777",
      postalCode: "01310-100",
      address: "Av. Paulista",
      addressNumber: "1000",
      province: "Bela Vista",
      city: "Sao Paulo",
      state: "sp",
    },
  };
}

describe("POST /api/billing/checkout (e2e)", () => {
  beforeAll(async () => {
    await app.ready();
    await createPlans();
    env.ASAAS_API_KEY = "test-asaas-key";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    env.ASAAS_API_KEY = undefined;
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "chk_asaas_1", status: "ACTIVE" }), {
        status: 200,
      }),
    );
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/billing/checkout")
      .send(validBody("any"));

    expect(response.status).toBe(401);
  });

  it("returns 500 missing_asaas_api_key when the integration is not configured", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    env.ASAAS_API_KEY = undefined;
    try {
      const response = await request(app.server)
        .post("/api/billing/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send(validBody("any"));

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "missing_asaas_api_key" });
    } finally {
      env.ASAAS_API_KEY = "test-asaas-key";
    }
  });

  it("rejects missing/invalid fields with machine-readable codes", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });
    const authed = () =>
      request(app.server)
        .post("/api/billing/checkout")
        .set("Authorization", `Bearer ${token}`);

    const missingStore = await authed().send({ plan_id: "pro" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const badPlan = await authed().send({ store_id: "s1", plan_id: "mega" });
    expect(badPlan.status).toBe(400);
    expect(badPlan.body).toEqual({ error: "invalid_plan_id" });

    const noCustomer = await authed().send({ store_id: "s1", plan_id: "pro" });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body).toEqual({ error: "missing_customer_data" });

    const body = validBody("s1");
    const noAddress = await authed().send({
      ...body,
      customer: { ...body.customer, address: " " },
    });
    expect(noAddress.status).toBe(400);
    expect(noAddress.body).toEqual({ error: "missing_customer_address" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("creates the hosted checkout and records the pending subscription", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(200);
    expect(response.body.checkout_id).toBe("chk_asaas_1");
    expect(response.body.checkout_url).toBe(
      "https://sandbox.asaas.com/checkoutSession/show?id=chk_asaas_1",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api-sandbox.asaas.com/v3/checkouts");
    const payload = JSON.parse(String((init as RequestInit).body));
    expect(payload.items[0]).toEqual({
      description: `Assinatura mensal Luup - ${store.name}`,
      name: "Luup Pro",
      quantity: 1,
      value: 299,
    });
    expect(payload.chargeTypes).toEqual(["RECURRENT"]);
    expect(payload.callback.successUrl).toBe(
      `${env.LUPP_APP_URL.replace(/\/$/, "")}/app/billing?checkout=success`,
    );
    expect(payload.customerData.cpfCnpj).toBe("12345678909");

    const row = await prisma.subscription.findFirstOrThrow({
      where: { store_id: store.id, provider: "asaas" },
    });
    expect(row.provider_checkout_id).toBe("chk_asaas_1");
    expect(row.provider_checkout_url).toBe(
      "https://sandbox.asaas.com/checkoutSession/show?id=chk_asaas_1",
    );
    expect(row.provider_status).toBe("checkout_created");
    expect(row.status).toBe("pending");
    expect(row.plan_id).toBe("pro");
    const metadata = row.metadata as {
      customer: { state: string };
      external_reference: string;
    };
    expect(metadata.customer.state).toBe("SP");
    expect(metadata.external_reference).toMatch(
      new RegExp(`^luup:${store.id}:pro:\\d+$`),
    );
  });

  it("returns 502 with the upstream error and status when Asaas rejects the checkout", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ description: "invalid postal code" }] }),
        { status: 400 },
      ),
    );

    const response = await request(app.server)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "invalid postal code", status: 400 });
    expect(
      await prisma.subscription.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });

  it("returns 502 when Asaas answers without a checkout id", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const response = await request(app.server)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "missing_asaas_checkout_id" });
  });
});
