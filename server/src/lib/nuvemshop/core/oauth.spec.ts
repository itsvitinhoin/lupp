import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { exchangeNuvemshopToken, NUVEMSHOP_TOKEN_URL, nuvemshopAppId, OauthClient } from "./oauth";

describe("OauthClient", () => {
  it("builds the authorize URL on the configured base with only state attached", () => {
    const url = new URL(new OauthClient().authorizeUrl("signed-state"));
    expect(url.origin).toBe(new URL(env.NUVEMSHOP_AUTHORIZE_BASE_URL).origin);
    expect(url.pathname).toBe(`/apps/${nuvemshopAppId()}/authorize`);
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect([...url.searchParams.keys()]).toEqual(["state"]);
  });

  describe("exchangeToken", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ access_token: "at-1", scope: "write_scripts", user_id: 3254942 }),
            { status: 200 },
          ),
      );
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("POSTs the authorization-code grant to the token endpoint", async () => {
      const client = new OauthClient();
      const result = await client.exchangeToken("code-1");

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(NUVEMSHOP_TOKEN_URL);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        client_id: nuvemshopAppId(),
        client_secret: env.NUVEMSHOP_CLIENT_SECRET,
        code: "code-1",
        grant_type: "authorization_code",
      });
      expect(result.ok).toBe(true);
      expect(result.data.access_token).toBe("at-1");
      expect(result.data.user_id).toBe(3254942);
    });

    it("keeps the legacy exchangeNuvemshopToken wrapper on the same request", async () => {
      const result = await exchangeNuvemshopToken("code-2");
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(NUVEMSHOP_TOKEN_URL);
      expect(result.data.access_token).toBe("at-1");
    });
  });
});
