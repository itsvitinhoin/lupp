import { describe, expect, it } from "vitest";
import {
  HOME_BENEFITS_SECTION_MIN_SCORE,
  resolveCarouselCardEntranceClass,
  resolveCarouselItemLimit,
  scoreBenefitsSectionText,
} from "./carousel";

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

describe("resolveCarouselCardEntranceClass", () => {
  it("starts invisible-until-scrolled when IntersectionObserver is available", () => {
    expect(resolveCarouselCardEntranceClass(true)).toBe(
      "lupp-home-carousel-card--pending",
    );
  });

  it("falls back to animating immediately when it isn't", () => {
    expect(resolveCarouselCardEntranceClass(false)).toBe(
      "lupp-home-carousel-card--entrance",
    );
  });
});

describe("scoreBenefitsSectionText", () => {
  it("scores a real Brazilian storefront benefits strip at or above the threshold", () => {
    const text =
      "frete gratis para todo o brasil pagamento em ate 12x sem juros ou pix com desconto pedido minimo";
    expect(scoreBenefitsSectionText(text)).toBeGreaterThanOrEqual(
      HOME_BENEFITS_SECTION_MIN_SCORE,
    );
  });

  it("scores unrelated text at 0", () => {
    expect(scoreBenefitsSectionText("bem vindo a nossa loja de roupas")).toBe(0);
  });

  it("only counts each keyword group once, even with multiple matching words", () => {
    // "frete" and "entrega" both belong to the shipping group — must not
    // double count within the same group.
    expect(scoreBenefitsSectionText("frete gratis e entrega rapida")).toBe(1);
  });

  it("accepts either accented or unaccented spellings for the same keyword", () => {
    expect(scoreBenefitsSectionText("pedido minimo de compra")).toBe(1);
    expect(scoreBenefitsSectionText("pedido mínimo de compra")).toBe(1);
  });
});
