import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreClient } from "./store";

const props = {
  accessToken: "token-1",
  externalStoreId: "3254942",
  userAgent: "Luup (suporte@luup.app)",
};

describe("StoreClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves the endpoint on the nuvemshop.com.br host", () => {
    expect(new StoreClient(props).endpoint).toBe(
      "https://api.nuvemshop.com.br/2025-03/3254942/store",
    );
  });

  it("gets the store with typed domains", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            domains: ["minhaloja.com.br"],
            original_domain: "3254942.lojavirtualnuvem.com.br",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new StoreClient(props);
    const result = await client.get();

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(client.endpoint);
    expect(result.data.domains).toEqual(["minhaloja.com.br"]);
    expect(result.data.original_domain).toBe("3254942.lojavirtualnuvem.com.br");
  });
});
