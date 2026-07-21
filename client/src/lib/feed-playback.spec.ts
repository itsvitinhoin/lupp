import { describe, expect, it } from "vitest";
import { resolvePreloadStrategy, resolveVideoFitMode } from "./feed-playback";

describe("resolvePreloadStrategy", () => {
  it("always preloads the active video aggressively", () => {
    expect(resolvePreloadStrategy(0, true)).toBe("auto");
    expect(resolvePreloadStrategy(0, false)).toBe("auto");
  });

  it("preloads the next video only when preloadNext is enabled", () => {
    expect(resolvePreloadStrategy(1, true)).toBe("auto");
    expect(resolvePreloadStrategy(1, false)).toBe("metadata");
  });

  it("never aggressively preloads previous videos, regardless of the setting", () => {
    expect(resolvePreloadStrategy(-1, true)).toBe("metadata");
    expect(resolvePreloadStrategy(-1, false)).toBe("metadata");
  });

  it("only biases the immediate next video, not further-ahead ones", () => {
    expect(resolvePreloadStrategy(2, true)).toBe("metadata");
  });
});

describe("resolveVideoFitMode", () => {
  it("cover-fills portrait video (including the 9:16 default)", () => {
    expect(resolveVideoFitMode("9:16")).toBe("cover");
    expect(resolveVideoFitMode("4:5")).toBe("cover");
  });

  it("contains square/landscape video instead of cropping it", () => {
    expect(resolveVideoFitMode("1:1")).toBe("contain");
    expect(resolveVideoFitMode("16:9")).toBe("contain");
    expect(resolveVideoFitMode("4:3")).toBe("contain");
  });

  it("defaults to cover for missing or malformed values", () => {
    expect(resolveVideoFitMode(null)).toBe("cover");
    expect(resolveVideoFitMode(undefined)).toBe("cover");
    expect(resolveVideoFitMode("")).toBe("cover");
    expect(resolveVideoFitMode("garbage")).toBe("cover");
    expect(resolveVideoFitMode("0:0")).toBe("cover");
  });
});
