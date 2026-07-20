import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseClient, nuvemshopApiBase, nuvemshopRequest, nuvemshopScriptsApiBase } from "./base";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

describe("api bases", () => {
  it("keeps the original hosts and version", () => {
    expect(nuvemshopApiBase("123")).toBe("https://api.nuvemshop.com.br/2025-03/123");
    expect(nuvemshopScriptsApiBase("123")).toBe(
      "https://api.tiendanube.com/2025-03/123/scripts",
    );
  });
});

describe("nuvemshopRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses JSON bodies and captures the Link header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([{ id: 1 }], {
          headers: { link: '<https://api/next>; rel="next"' },
        }),
      ),
    );
    const result = await nuvemshopRequest("https://api/x", { headers: {} });
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      data: [{ id: 1 }],
      linkHeader: '<https://api/next>; rel="next"',
    });
  });

  it("keeps non-JSON bodies in text with empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>boom</html>", { status: 502 })),
    );
    const result = await nuvemshopRequest("https://api/x", { headers: {} });
    expect(result).toMatchObject({
      ok: false,
      status: 502,
      data: {},
      text: "<html>boom</html>",
    });
  });
});

describe("BaseClient.doRequest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends bearer auth, JSON content type and the provider User-Agent", async () => {
    const client = new BaseClient({
      accessToken: "token-1",
      userAgent: "Luup (suporte@luup.app)",
    });
    await client.doRequest("post", "https://api/x", { a: 1 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api/x");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-1",
      "Content-Type": "application/json",
      "User-Agent": "Luup (suporte@luup.app)",
    });
  });

  it("omits Authorization without a token and lets explicit headers win", async () => {
    const client = new BaseClient();
    await client.doRequest("GET", "https://api/x", undefined, {
      Authentication: "bearer legacy",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).toMatchObject({ Authentication: "bearer legacy" });
  });

  it("buffers the request/response with the token redacted", async () => {
    const client = new BaseClient({ accessToken: "token-1" });
    await client.doRequest("GET", "https://api/x");

    expect(client.lastRequest).toMatchObject({
      method: "GET",
      url: "https://api/x",
      headers: { Authorization: "<redacted>" },
    });
    expect(client.lastResponse).toMatchObject({ status: 200, body: { ok: true } });
    expect(client.lastRequests).toHaveLength(1);
    expect(client.lastResponses).toHaveLength(1);
  });
});
