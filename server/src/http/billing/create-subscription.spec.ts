import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { createPlans } from "../../../test/utils/create-plans";
import { createStore } from "../../../test/utils/create-store";
import { createUser } from "../../../test/utils/create-user";

const fetchMock = vi.fn();

function validBody(storeId: string, extra: Record<string, unknown> = {}) {
  return {
    store_id: storeId,
    plan_id: "growth",
    customer: {
      name: "Maria Silva",
      email: "maria@example.com",
      cpfCnpj: "123.456.789-09",
      phone: "(11) 99999-8888",
      postalCode: "01310-100",
      address: "Av. Paulista",
      addressNumber: "1000",
      province: "Bela Vista",
    },
    card: {
      holderName: "MARIA SILVA",
      number: "4111 1111 1111 1111",
      expiryMonth: "5",
      expiryYear: "2030",
      ccv: "123",
    },
    ...extra,
  };
}

function mockAsaasHappyPath() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/customers")) {
      return new Response(JSON.stringify({ id: "cus_asaas_1" }), { status: 200 });
    }
    if (path.endsWith("/subscriptions") && init?.method === "POST") {
      return new Response(
        JSON.stringify({ id: "sub_asaas_1", status: "ACTIVE" }),
        { status: 200 },
      );
    }
    if (path.includes("/subscriptions/") && init?.method === "PUT") {
      return new Response(
        JSON.stringify({ id: "sub_asaas_1", status: "ACTIVE" }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

describe("POST /api/billing/subscriptions (e2e)", () => {
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
    mockAsaasHappyPath();
  });

  it("requires authentication", async () => {
    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .send(validBody("any"));

    expect(response.status).toBe(401);
  });

  it("returns 500 missing_asaas_api_key when the integration is not configured", async () => {
    const user = await createUser();
    const token = app.jwt.sign({ sub: user.id, role: "agent" });

    env.ASAAS_API_KEY = undefined;
    try {
      const response = await request(app.server)
        .post("/api/billing/subscriptions")
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
        .post("/api/billing/subscriptions")
        .set("Authorization", `Bearer ${token}`);

    const missingStore = await authed().send({ plan_id: "growth" });
    expect(missingStore.status).toBe(400);
    expect(missingStore.body).toEqual({ error: "missing_store_id" });

    const badPlan = await authed().send({ store_id: "s1", plan_id: "mega" });
    expect(badPlan.status).toBe(400);
    expect(badPlan.body).toEqual({ error: "invalid_plan_id" });

    const noCustomer = await authed().send({ store_id: "s1", plan_id: "growth" });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body).toEqual({ error: "missing_customer_data" });

    const body = validBody("s1");
    const noAddress = await authed().send({
      ...body,
      customer: { ...(body.customer as object), postalCode: "" },
    });
    expect(noAddress.status).toBe(400);
    expect(noAddress.body).toEqual({ error: "missing_customer_address" });

    const noCard = await authed().send({ ...body, card: { holderName: "M" } });
    expect(noCard.status).toBe(400);
    expect(noCard.body).toEqual({ error: "missing_card_data" });
  });

  it("denies a user who is not a member of the store", async () => {
    const { store } = await createStore();
    const outsider = await createUser();
    const token = app.jwt.sign({ sub: outsider.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "store_access_denied" });
  });

  it("creates the Asaas customer + subscription and persists the pending row", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });

    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(200);
    expect(response.body.subscription_id).toBe("sub_asaas_1");
    expect(response.body.reused_subscription).toBeUndefined();

    const row = await prisma.subscription.findFirstOrThrow({
      where: { store_id: store.id, provider: "asaas" },
    });
    expect(row.provider_subscription_id).toBe("sub_asaas_1");
    expect(row.provider_customer_id).toBe("cus_asaas_1");
    expect(row.plan_id).toBe("growth");
    expect(row.status).toBe("pending");
    expect(row.provider_status).toBe("ACTIVE");
    expect(row.discount_code).toBeNull();

    // Both calls hit the sandbox API with the access_token header and the
    // full plan price (no coupon).
    const calls = fetchMock.mock.calls;
    expect(String(calls[0][0])).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect(String(calls[1][0])).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions",
    );
    const headers = (calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.access_token).toBe("test-asaas-key");
    const subscriptionPayload = JSON.parse(String((calls[1][1] as RequestInit).body));
    expect(subscriptionPayload.value).toBe(199);
    expect(subscriptionPayload.creditCard.number).toBe("4111111111111111");
    expect(subscriptionPayload.externalReference).toMatch(
      new RegExp(`^luup:${store.id}:growth:\\d+$`),
    );
  });

  it("applies a discount coupon case-insensitively and increments its redemption count", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const coupon = await prisma.discountCoupon.create({
      data: { code: "LAUNCH10", percent_off: 10, is_active: true },
    });

    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id, { coupon_code: "launch10" }));

    expect(response.status).toBe(200);

    // growth = 199; 10% off => 19.90 discount, 179.10 charged on Asaas.
    const subscriptionCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/subscriptions"),
    );
    const payload = JSON.parse(String((subscriptionCall![1] as RequestInit).body));
    expect(payload.value).toBe(179.1);

    const row = await prisma.subscription.findFirstOrThrow({
      where: { store_id: store.id, provider: "asaas" },
    });
    expect(row.discount_coupon_id).toBe(coupon.id);
    expect(row.discount_code).toBe("LAUNCH10");
    expect(Number(row.discount_percent)).toBe(10);
    expect(Number(row.discount_amount)).toBeCloseTo(19.9);
    const metadata = row.metadata as { discount: { final_price: number } };
    expect(metadata.discount.final_price).toBe(179.1);

    const updatedCoupon = await prisma.discountCoupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    expect(updatedCoupon.redemption_count).toBe(1);
  });

  it("rejects unknown, inactive, expired and exhausted coupons", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    await prisma.discountCoupon.create({
      data: { code: "INACTIVE", percent_off: 10, is_active: false },
    });
    await prisma.discountCoupon.create({
      data: {
        code: "EXPIRED",
        percent_off: 10,
        expires_at: new Date(Date.now() - 60_000),
      },
    });
    await prisma.discountCoupon.create({
      data: { code: "MAXED", percent_off: 10, max_redemptions: 1, redemption_count: 1 },
    });

    for (const code of ["UNKNOWN", "INACTIVE", "EXPIRED", "MAXED"]) {
      const response = await request(app.server)
        .post("/api/billing/subscriptions")
        .set("Authorization", `Bearer ${token}`)
        .send(validBody(store.id, { coupon_code: code }));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "invalid_discount_coupon" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates the existing Asaas subscription in place and promotes the store plan", async () => {
    const { owner, store } = await createStore({ plan_id: "start" });
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    const existing = await prisma.subscription.create({
      data: {
        store_id: store.id,
        plan_id: "start",
        provider: "asaas",
        provider_subscription_id: "sub_existing",
        status: "active",
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(200);
    expect(response.body.reused_subscription).toBe(true);
    expect(response.body.subscription_id).toBe("sub_existing");

    // A single PUT against the existing subscription, no customer creation.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_existing",
    );
    expect((init as RequestInit).method).toBe("PUT");

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(row.plan_id).toBe("growth");
    expect(row.status).toBe("active");
    const metadata = row.metadata as {
      last_plan_change: { from_plan_id: string; to_plan_id: string; source: string };
    };
    expect(metadata.last_plan_change.from_plan_id).toBe("start");
    expect(metadata.last_plan_change.to_plan_id).toBe("growth");
    expect(metadata.last_plan_change.source).toBe("checkout_existing_subscription");

    const updatedStore = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { plan_id: true },
    });
    expect(updatedStore.plan_id).toBe("growth");
  });

  it("surfaces Asaas errors as 502 with the upstream description", async () => {
    const { owner, store } = await createStore();
    const token = app.jwt.sign({ sub: owner.id, role: "agent" });
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ errors: [{ description: "invalid credit card" }] }),
          { status: 400 },
        ),
    );

    const response = await request(app.server)
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody(store.id));

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "invalid credit card" });
    expect(
      await prisma.subscription.count({ where: { store_id: store.id } }),
    ).toBe(0);
  });
});
