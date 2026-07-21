import { afterEach, describe, expect, it, vi } from "vitest";
import { AsaasClient } from "./client";
import {
  asaasApiBase,
  asaasCheckoutBaseUrl,
  asaasRequest,
  readAsaasError,
} from "./core/base";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("api bases", () => {
  it("keeps the original hosts per environment", () => {
    expect(asaasApiBase("sandbox")).toBe("https://api-sandbox.asaas.com/v3");
    expect(asaasApiBase("production")).toBe("https://api.asaas.com/v3");
    expect(asaasCheckoutBaseUrl("sandbox")).toBe(
      "https://sandbox.asaas.com/checkoutSession/show",
    );
    expect(asaasCheckoutBaseUrl("production")).toBe(
      "https://asaas.com/checkoutSession/show",
    );
  });
});

describe("readAsaasError", () => {
  it("prefers errors[].description, then message, then the generic code", async () => {
    expect(
      await readAsaasError(
        jsonResponse({ errors: [{ description: "CPF inválido" }] }, 400),
      ),
    ).toBe("CPF inválido");
    expect(await readAsaasError(jsonResponse({ message: "boom" }, 500))).toBe(
      "boom",
    );
    expect(await readAsaasError(new Response("not json", { status: 500 }))).toBe(
      "asaas_request_failed",
    );
  });
});

describe("asaasRequest (legacy flat helper)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs JSON with the access_token header and returns the parsed body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "sub_1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await asaasRequest<{ id: string }>("/subscriptions", {
      value: 10,
    });

    expect(result).toEqual({ id: "sub_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(`${asaasApiBase()}/subscriptions`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect("access_token" in init.headers).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ value: 10 });
  });

  it("throws the extracted Asaas error on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ errors: [{ description: "Cartão recusado" }] }, 400),
      ),
    );

    await expect(asaasRequest("/subscriptions", {})).rejects.toThrow(
      "Cartão recusado",
    );
  });
});

describe("AsaasClient wiring", () => {
  afterEach(() => vi.unstubAllGlobals());

  const client = new AsaasClient({ apiKey: "key-1", environment: "sandbox" });

  it("scopes every resource to the same environment", () => {
    expect(client.customers.endpoint).toBe(
      "https://api-sandbox.asaas.com/v3/customers",
    );
    expect(client.subscriptions.endpoint).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions",
    );
    expect(client.checkouts.endpoint).toBe(
      "https://api-sandbox.asaas.com/v3/checkouts",
    );
    expect(client.checkouts.checkoutUrl("chk 1")).toBe(
      "https://sandbox.asaas.com/checkoutSession/show?id=chk%201",
    );
  });

  it("records redacted inspection buffers and surfaces errorMessage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "cus_1" }))
      .mockResolvedValueOnce(
        jsonResponse({ errors: [{ description: "Assinatura não encontrada" }] }, 404),
      );
    vi.stubGlobal("fetch", fetchMock);

    const created = await client.customers.create({ name: "Ana" });
    expect(created).toMatchObject({ ok: true, status: 200, errorMessage: null });
    expect(client.customers.lastRequest).toMatchObject({
      method: "POST",
      url: "https://api-sandbox.asaas.com/v3/customers",
      body: { name: "Ana" },
    });
    // The API key must never survive into the buffered copy.
    expect(client.customers.lastRequest?.headers.access_token).toBe("<redacted>");

    const removed = await client.subscriptions.remove("sub_missing");
    expect(removed).toMatchObject({
      ok: false,
      status: 404,
      errorMessage: "Assinatura não encontrada",
    });
    expect(client.subscriptions.lastRequest).toMatchObject({
      method: "DELETE",
      url: "https://api-sandbox.asaas.com/v3/subscriptions/sub_missing",
    });
    expect(client.subscriptions.lastResponse?.status).toBe(404);
  });
});
