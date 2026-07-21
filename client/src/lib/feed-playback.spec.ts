import { describe, expect, it } from "vitest";
import {
  pickMostVisibleVideoId,
  resolveKeyboardNavigationIndex,
  resolvePreloadStrategy,
  resolveVideoFitMode,
  shouldShowBufferingSpinner,
} from "./feed-playback";

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

describe("pickMostVisibleVideoId", () => {
  it("returns null when nothing is intersecting", () => {
    expect(
      pickMostVisibleVideoId([
        { isIntersecting: false, intersectionRatio: 0, videoId: "a" },
      ]),
    ).toBeNull();
  });

  it("picks the highest intersection ratio among intersecting entries", () => {
    expect(
      pickMostVisibleVideoId([
        { isIntersecting: true, intersectionRatio: 0.7, videoId: "a" },
        { isIntersecting: true, intersectionRatio: 0.95, videoId: "b" },
        { isIntersecting: false, intersectionRatio: 1, videoId: "c" },
      ]),
    ).toBe("b");
  });

  it("ignores non-intersecting entries even with a high ratio", () => {
    expect(
      pickMostVisibleVideoId([
        { isIntersecting: true, intersectionRatio: 0.65, videoId: "a" },
        { isIntersecting: false, intersectionRatio: 0.99, videoId: "b" },
      ]),
    ).toBe("a");
  });
});

describe("shouldShowBufferingSpinner", () => {
  it("shows only for the active, buffering, unpaused, real video", () => {
    expect(
      shouldShowBufferingSpinner({
        hasRealVideo: true,
        isActiveVideo: true,
        isBuffering: true,
        isPaused: false,
      }),
    ).toBe(true);
  });

  it("hides for inactive videos even if buffering", () => {
    expect(
      shouldShowBufferingSpinner({
        hasRealVideo: true,
        isActiveVideo: false,
        isBuffering: true,
        isPaused: false,
      }),
    ).toBe(false);
  });

  it("hides while the viewer has paused the video", () => {
    expect(
      shouldShowBufferingSpinner({
        hasRealVideo: true,
        isActiveVideo: true,
        isBuffering: true,
        isPaused: true,
      }),
    ).toBe(false);
  });

  it("hides for thumbnail-only placeholders with no real video", () => {
    expect(
      shouldShowBufferingSpinner({
        hasRealVideo: false,
        isActiveVideo: true,
        isBuffering: true,
        isPaused: false,
      }),
    ).toBe(false);
  });
});

describe("resolveKeyboardNavigationIndex", () => {
  it("moves to the next video on ArrowDown", () => {
    expect(resolveKeyboardNavigationIndex("ArrowDown", 0, 3)).toBe(1);
  });

  it("moves to the previous video on ArrowUp", () => {
    expect(resolveKeyboardNavigationIndex("ArrowUp", 1, 3)).toBe(0);
  });

  it("clamps at the end instead of wrapping", () => {
    expect(resolveKeyboardNavigationIndex("ArrowDown", 2, 3)).toBeNull();
  });

  it("clamps at the start instead of wrapping", () => {
    expect(resolveKeyboardNavigationIndex("ArrowUp", 0, 3)).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(resolveKeyboardNavigationIndex("Enter", 1, 3)).toBeNull();
  });

  it("returns null for an empty feed", () => {
    expect(resolveKeyboardNavigationIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
