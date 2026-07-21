import { describe, expect, it, vi } from "vitest";
import { attachBufferingListener, shouldReleaseQualityPin } from "./video-buffering";

function createVideoElement() {
  return document.createElement("video");
}

describe("shouldReleaseQualityPin", () => {
  it("never releases before the video has played once, even while buffering", () => {
    expect(
      shouldReleaseQualityPin({
        alreadyReleased: false,
        hasPlayedOnce: false,
        isBuffering: true,
      }),
    ).toBe(false);
  });

  it("releases once real playback stalls after the video has already played", () => {
    expect(
      shouldReleaseQualityPin({
        alreadyReleased: false,
        hasPlayedOnce: true,
        isBuffering: true,
      }),
    ).toBe(true);
  });

  it("does not release while merely playing (not buffering)", () => {
    expect(
      shouldReleaseQualityPin({
        alreadyReleased: false,
        hasPlayedOnce: true,
        isBuffering: false,
      }),
    ).toBe(false);
  });

  it("never re-releases once already released", () => {
    expect(
      shouldReleaseQualityPin({
        alreadyReleased: true,
        hasPlayedOnce: true,
        isBuffering: true,
      }),
    ).toBe(false);
  });
});

describe("attachBufferingListener", () => {
  it("reports buffering on waiting/stalled and ready on playing/canplay/loadeddata", () => {
    const video = createVideoElement();
    const onBufferingChange = vi.fn();
    attachBufferingListener(video, onBufferingChange);

    video.dispatchEvent(new Event("waiting"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(true);

    video.dispatchEvent(new Event("playing"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(false);

    video.dispatchEvent(new Event("stalled"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(true);

    video.dispatchEvent(new Event("canplay"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(false);

    video.dispatchEvent(new Event("waiting"));
    video.dispatchEvent(new Event("loadeddata"));
    expect(onBufferingChange).toHaveBeenLastCalledWith(false);

    expect(onBufferingChange).toHaveBeenCalledTimes(6);
  });

  it("stops reporting once detached", () => {
    const video = createVideoElement();
    const onBufferingChange = vi.fn();
    const detach = attachBufferingListener(video, onBufferingChange);

    detach();
    video.dispatchEvent(new Event("waiting"));
    video.dispatchEvent(new Event("playing"));

    expect(onBufferingChange).not.toHaveBeenCalled();
  });
});
