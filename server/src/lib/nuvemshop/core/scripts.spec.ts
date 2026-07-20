import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScriptsClient } from "./scripts";

const props = {
  accessToken: "token-1",
  externalStoreId: "3254942",
  userAgent: "Luup (suporte@luup.app)",
};

describe("ScriptsClient", () => {
  it("resolves the endpoint on the tiendanube.com host (Scripts API)", () => {
    expect(new ScriptsClient(props).endpoint).toBe(
      "https://api.tiendanube.com/2025-03/3254942/scripts",
    );
  });

  describe("requests", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("lists installations with pagination and bearer auth", async () => {
      const client = new ScriptsClient(props);
      await client.list({ page: 1, perPage: 100 });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${client.endpoint}?page=1&per_page=100`);
      expect(init.method).toBe("GET");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer token-1",
        "User-Agent": "Luup (suporte@luup.app)",
      });
    });

    it("creates an installation with query_params", async () => {
      const client = new ScriptsClient(props);
      const body = {
        script_id: 8514,
        query_params: { lupp_store: "dzns", lupp_widget: "floating_launcher" },
      };
      await client.create(body);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(client.endpoint);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual(body);
    });

    it("updates an existing installation by id", async () => {
      const client = new ScriptsClient(props);
      await client.update("8514", { query_params: { lupp_store: "dzns" } });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${client.endpoint}/8514`);
      expect(init.method).toBe("PUT");
    });
  });
});
