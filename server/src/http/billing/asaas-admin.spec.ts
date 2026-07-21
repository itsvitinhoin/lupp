import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createUser } from "../../../test/utils/create-user";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("GET /api/billing/asaas/* (e2e)", () => {
  let adminToken: string;

  beforeAll(async () => {
    await app.ready();
    process.env.ASAAS_API_KEY ||= "test-key";
    const admin = await createUser({ role: "admin" });
    adminToken = app.jwt.sign({ sub: admin.id, role: "admin" });
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await app.close();
  });

  it("gates on the admin role (claim and DB)", async () => {
    const outsider = await createUser();
    const agentToken = app.jwt.sign({ sub: outsider.id, role: "agent" });
    const deniedByClaim = await request(app.server)
      .get("/api/billing/asaas/account")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(deniedByClaim.status).toBe(401);

    const staleToken = app.jwt.sign({ sub: outsider.id, role: "admin" });
    const deniedByRole = await request(app.server)
      .get("/api/billing/asaas/payments")
      .set("Authorization", `Bearer ${staleToken}`);
    expect(deniedByRole.status).toBe(403);
    expect(deniedByRole.body).toEqual({ error: "admin_access_denied" });
  });

  it("returns the account overview and tolerates a failing part", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/finance/balance")) {
          return jsonResponse({ balance: 1234.56 });
        }
        // Webhook config listing fails upstream -> null part, 200 overall.
        return jsonResponse({ errors: [{ description: "forbidden" }] }, 403);
      }),
    );

    const response = await request(app.server)
      .get("/api/billing/asaas/account")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ balance: 1234.56, webhooks: null });
    expect(["sandbox", "production"]).toContain(response.body.environment);
  });

  it("proxies payment listings with clamped pagination and filters", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "list",
        hasMore: false,
        totalCount: 1,
        limit: 20,
        offset: 0,
        data: [{ id: "pay_1", value: 199, status: "RECEIVED" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .get("/api/billing/asaas/payments?status=RECEIVED&limit=500&offset=40")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: "pay_1", value: 199, status: "RECEIVED" },
    ]);
    const [calledWith] = fetchMock.mock.calls[0] as unknown as [string];
    const calledUrl = new URL(String(calledWith));
    expect(calledUrl.pathname.endsWith("/payments")).toBe(true);
    expect(calledUrl.searchParams.get("status")).toBe("RECEIVED");
    expect(calledUrl.searchParams.get("offset")).toBe("40");
    expect(calledUrl.searchParams.get("limit")).toBe("100"); // clamped
  });

  it("passes payment date-range and billingType filters as Asaas bracket params", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ object: "list", hasMore: false, data: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .get(
        "/api/billing/asaas/payments?billingType=PIX&dueDateGe=2026-07-01&dueDateLe=2026-07-21&externalReference=luup:s1",
      )
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const calledUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.searchParams.get("billingType")).toBe("PIX");
    expect(calledUrl.searchParams.get("dueDate[ge]")).toBe("2026-07-01");
    expect(calledUrl.searchParams.get("dueDate[le]")).toBe("2026-07-21");
    expect(calledUrl.searchParams.get("externalReference")).toBe("luup:s1");
  });

  it("lists invoices (notas fiscais) with status and effectiveDate filters", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "list",
        hasMore: false,
        totalCount: 1,
        data: [{ id: "inv_1", status: "AUTHORIZED", value: 199 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.server)
      .get(
        "/api/billing/asaas/invoices?status=AUTHORIZED&effectiveDateGe=2026-07-01",
      )
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ id: "inv_1" });
    const calledUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(calledUrl.pathname.endsWith("/invoices")).toBe(true);
    expect(calledUrl.searchParams.get("status")).toBe("AUTHORIZED");
    expect(calledUrl.searchParams.get("effectiveDate[ge]")).toBe("2026-07-01");
  });

  it("builds the statistics summary tolerating failing slices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const status = url.searchParams.get("status");
        if (status === "PENDING") {
          return jsonResponse({ quantity: 4, value: 796, netValue: 780 });
        }
        if (status === "RECEIVED") {
          return jsonResponse({ quantity: 10, value: 1990, netValue: 1900 });
        }
        return jsonResponse({ errors: [{ description: "boom" }] }, 500);
      }),
    );

    const response = await request(app.server)
      .get("/api/billing/asaas/summary?days=30")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pending).toEqual({ quantity: 4, value: 796, netValue: 780 });
    expect(response.body.received).toEqual({
      quantity: 10,
      value: 1990,
      netValue: 1900,
    });
    expect(response.body.overdue).toBeNull();
    expect(response.body.days).toBe(30);
  });

  it("buckets the daily payment series with zero-filled days", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          object: "list",
          hasMore: false,
          data: [
            { dateCreated: today, status: "RECEIVED", value: 199 },
            { dateCreated: today, status: "PENDING", value: 149 },
            { dateCreated: "1999-01-01", status: "RECEIVED", value: 999 },
          ],
        }),
      ),
    );

    const response = await request(app.server)
      .get("/api/billing/asaas/payments/daily?days=7")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.series).toHaveLength(7);
    const todayBucket = response.body.series.find(
      (bucket: { date: string }) => bucket.date === today,
    );
    expect(todayBucket).toMatchObject({ count: 2, value: 348, paid_value: 199 });
    // Out-of-window rows are dropped, empty days stay zeroed.
    const total = response.body.series.reduce(
      (sum: number, bucket: { count: number }) => sum + bucket.count,
      0,
    );
    expect(total).toBe(2);
  });

  it("surfaces Asaas errors as 502 on customer/subscription listings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ errors: [{ description: "invalid_api_key" }] }, 401),
      ),
    );

    const customers = await request(app.server)
      .get("/api/billing/asaas/customers?name=ana")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(customers.status).toBe(502);
    expect(customers.body).toEqual({ error: "invalid_api_key" });

    const subscriptions = await request(app.server)
      .get("/api/billing/asaas/subscriptions?status=ACTIVE")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(subscriptions.status).toBe(502);
  });
});
