import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsClient } from "./products";

const props = {
  accessToken: "token-1",
  externalStoreId: "3254942",
  userAgent: "Luup (suporte@luup.app)",
};

describe("ProductsClient", () => {
  it("resolves the endpoint on the nuvemshop.com.br host", () => {
    expect(new ProductsClient(props).endpoint).toBe(
      "https://api.nuvemshop.com.br/2025-03/3254942/products",
    );
  });

  describe("requests", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify([{ id: 1 }]), {
            status: 200,
            headers: {
              link: '<https://api.nuvemshop.com.br/2025-03/3254942/products?page=2&per_page=100>; rel="next"',
            },
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("lists with page/per_page and surfaces the Link header for pagination", async () => {
      const client = new ProductsClient(props);
      const result = await client.list();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${client.endpoint}?page=1&per_page=100`);
      expect(init.method).toBe("GET");
      expect(init.headers).toMatchObject({ Authorization: "Bearer token-1" });
      expect(result.linkHeader).toContain('rel="next"');
    });

    it("follows an absolute next-page URL via listByUrl", async () => {
      const client = new ProductsClient(props);
      const next = `${client.endpoint}?page=2&per_page=100`;
      await client.listByUrl(next);
      expect(fetchMock.mock.calls[0][0]).toBe(next);
      expect(client.lastRequest?.url).toBe(next);
    });
  });
});
