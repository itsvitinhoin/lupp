import { describe, expect, it } from "vitest";
import { NuvemshopClient } from "./client";
import { hasNuvemshopCredentials, testEnv } from "./test/env";

describe("NuvemshopClient wiring", () => {
  const client = new NuvemshopClient({
    accessToken: "token-1",
    externalStoreId: "3254942",
    userAgent: "Luup (suporte@luup.app)",
  });

  it("scopes every store resource to the same store and token", () => {
    expect(client.products.endpoint).toBe(
      "https://api.nuvemshop.com.br/2025-03/3254942/products",
    );
    expect(client.store.endpoint).toBe(
      "https://api.nuvemshop.com.br/2025-03/3254942/store",
    );
    expect(client.scripts.endpoint).toBe(
      "https://api.tiendanube.com/2025-03/3254942/scripts",
    );
    expect(client.products.token).toBe("token-1");
    expect(client.scripts.token).toBe("token-1");
    expect(client.store.token).toBe("token-1");
  });

  it("exposes a token-free oauth namespace", () => {
    expect(client.oauth.token).toBeUndefined();
    expect(client.oauth.endpoint).toBe("https://www.tiendanube.com/apps/authorize/token");
  });
});

// Live integration: runs only when NUVEMSHOP_TEST_ACCESS_TOKEN and
// NUVEMSHOP_TEST_STORE_ID are exported (skipped in CI). Calls may fail on
// scope/permission grounds — assertions target the inspection buffers, which
// record the request either way.
describe.skipIf(!hasNuvemshopCredentials)("NuvemshopClient (live)", () => {
  const client = new NuvemshopClient({
    accessToken: testEnv.NUVEMSHOP_TEST_ACCESS_TOKEN,
    externalStoreId: testEnv.NUVEMSHOP_TEST_STORE_ID,
    userAgent: testEnv.NUVEMSHOP_USER_AGENT,
  });

  it("fetches the store", async () => {
    const result = await client.store.get();
    expect(client.store.lastRequest?.url).toBe(client.store.endpoint);
    expect(client.store.lastRequest?.headers.Authorization).toBe("<redacted>");
    expect(result.status).toBeGreaterThan(0);
    if (result.ok) expect(result.data.original_domain).toBeTruthy();
  });

  it("lists script installations", async () => {
    const result = await client.scripts.list().catch(() => undefined);
    expect(client.scripts.lastRequest?.method).toBe("GET");
    expect(client.scripts.lastRequest?.url).toContain("/scripts?page=1&per_page=100");
    if (result?.ok) expect(Array.isArray(result.data)).toBe(true);
  });
});
