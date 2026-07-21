import { describe, expect, it } from "vitest";
import { resolveCarouselItemLimit } from "./carousel";

describe("resolveCarouselItemLimit", () => {
  const config = { maxItems: 12, mobileMaxItems: 6 };

  it("uses mobileMaxItems on mobile viewports and maxItems otherwise", () => {
    expect(resolveCarouselItemLimit(true, config)).toBe(6);
    expect(resolveCarouselItemLimit(false, config)).toBe(12);
  });

  it("never returns fewer than 1, even for a misconfigured limit", () => {
    expect(resolveCarouselItemLimit(true, { maxItems: 12, mobileMaxItems: 0 })).toBe(1);
    expect(
      resolveCarouselItemLimit(false, { maxItems: Number.NaN, mobileMaxItems: 6 }),
    ).toBe(1);
  });
});
