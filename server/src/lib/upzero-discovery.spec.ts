import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverUpzeroCartContext,
  extractUpzeroCartActionIds,
  extractUpzeroStorefrontStoreId,
} from "./upzero-discovery";

describe("extractUpzeroCartActionIds", () => {
  it("finds the addStorefrontCartItemsBatchAction id through the real (0,ns.fn) bundler indirection", () => {
    // Captured verbatim (trimmed) from a live storefront's built chunk — the
    // exact bug this regression guards: `(0,i.createServerReference)` sits
    // between the identifier and the opening quote, and the id is 42 hex
    // chars, not the 40 the extractor originally assumed.
    const chunk =
      'var t=e.i(43476),r=e.i(71645),i=e.i(95187);let n=(0,i.createServerReference)("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5",i.callServer,void 0,i.findSourceMapURL,"addStorefrontCartItemsBatchAction"),' +
      'l=(0,i.createServerReference)("40ea97beb606fdb737317191c560ba8d18b7ec81af",i.callServer,void 0,i.findSourceMapURL,"applyStorefrontCartCouponAction");';

    const ids = extractUpzeroCartActionIds(chunk);

    expect(ids[0]).toBe("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5");
  });

  it("still matches a direct createServerReference(...) call with no wrapper", () => {
    const chunk =
      'let n=createServerReference("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5",callServer,void 0,findSourceMapURL,"addStorefrontCartItemsBatchAction");';

    const ids = extractUpzeroCartActionIds(chunk);

    expect(ids[0]).toBe("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5");
  });

  it("falls back to the cart-keyword heuristic when the action name isn't present", () => {
    const chunk = 'x("408daab2de2a1f9fc8b09b3e90012affbba43691c2");cart.storeId=40;';

    const ids = extractUpzeroCartActionIds(chunk);

    expect(ids).toContain("408daab2de2a1f9fc8b09b3e90012affbba43691c2");
  });

  it("returns nothing for text with no matching hashes", () => {
    expect(extractUpzeroCartActionIds("no hashes here")).toEqual([]);
  });
});

describe("discoverUpzeroCartContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let a broad-heuristic match in an early chunk pre-empt the correctly-named action in a later chunk", async () => {
    // Regression for the bug found via a live storefront: the first chunk
    // the page references only has an unrelated hash sitting near cart
    // keywords (a low-confidence fallback match); the real
    // addStorefrontCartItemsBatchAction reference lives in a later chunk.
    // The old per-chunk short-circuit stopped at the first chunk and never
    // reached the real one.
    const html =
      '<html><script src="/_next/static/chunk-a.js"></script>' +
      '<script src="/_next/static/chunk-b.js"></script>' +
      '<script id="__NEXT_DATA__">{"props":{"store":{"id":40}}}</script></html>';
    const chunkA = 'x("408daab2de2a1f9fc8b09b3e90012affbba43691c2");cart.storeId=40;';
    const chunkB =
      'let n=(0,i.createServerReference)("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5",i.callServer,void 0,i.findSourceMapURL,"addStorefrontCartItemsBatchAction");';

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.endsWith("chunk-a.js") ? chunkA : url.endsWith("chunk-b.js") ? chunkB : html;
        return { ok: true, text: async () => body } as Response;
      }),
    );

    const result = await discoverUpzeroCartContext("https://vitrine-plus.upzero.com.br/40/produtos/x");

    expect(result.cart_action_ids[0]).toBe("4050f222726ac4ba82ba4fcd4ee06f86c586c318e5");
    expect(result.storefront_store_id).toBe(40);
  });
});

describe("extractUpzeroStorefrontStoreId", () => {
  it("reads a flat storeId field", () => {
    expect(extractUpzeroStorefrontStoreId('{"storeId": 40}')).toBe(40);
  });

  it("reads a nested store.id field", () => {
    expect(
      extractUpzeroStorefrontStoreId(
        '<script id="__NEXT_DATA__">{"props":{"store":{"id":40}}}</script>',
      ),
    ).toBe(40);
  });
});
