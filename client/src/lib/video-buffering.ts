/**
 * Decides whether a temporarily pinned playback quality (e.g. a forced
 * high starting level) should be released back to normal adaptive bitrate.
 * Only true once *real* mid-playback buffering happens — the initial
 * cold-start buffering every quality level needs (before the first
 * successful play) must not count, or a forced-high start would abandon
 * its pin before ever showing a frame at that quality.
 */
export function shouldReleaseQualityPin(state: {
  alreadyReleased: boolean;
  hasPlayedOnce: boolean;
  isBuffering: boolean;
}): boolean {
  return !state.alreadyReleased && state.hasPlayedOnce && state.isBuffering;
}

/**
 * Wires a video element's native readiness events to a single buffering
 * callback, so callers (LazyVideoPlayer) don't each hand-roll the same
 * event list. Kept as a plain DOM function (not a hook) so it's testable
 * against a real `<video>` element without rendering React.
 */
export function attachBufferingListener(
  video: HTMLVideoElement,
  onBufferingChange: (isBuffering: boolean) => void,
): () => void {
  const markBuffering = () => onBufferingChange(true);
  const markReady = () => onBufferingChange(false);

  video.addEventListener("waiting", markBuffering);
  video.addEventListener("stalled", markBuffering);
  video.addEventListener("playing", markReady);
  video.addEventListener("canplay", markReady);
  video.addEventListener("loadeddata", markReady);

  return () => {
    video.removeEventListener("waiting", markBuffering);
    video.removeEventListener("stalled", markBuffering);
    video.removeEventListener("playing", markReady);
    video.removeEventListener("canplay", markReady);
    video.removeEventListener("loadeddata", markReady);
  };
}
