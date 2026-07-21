/**
 * Pure decision logic for the vertical feed's video playback — kept free of
 * DOM/React so it's directly unit-testable and reusable between the feed
 * page and any future host of LazyVideoPlayer.
 */

/** How far a windowed feed item sits from the active video (0 = active, 1 = next, -1 = previous). */
export type FeedOffsetFromActive = number;

export type VideoPreloadStrategy = "auto" | "metadata";

/**
 * Directional preload: the active video always preloads aggressively (it
 * must play now); the NEXT video does too when the merchant's "preload
 * next" setting is on — matching how Reels/TikTok bias buffering forward.
 * Anything else (previous videos, or next when the setting is off) only
 * fetches metadata, since a video that already played rarely needs
 * re-buffering and unwatched-backward videos are a low-probability swipe.
 */
export function resolvePreloadStrategy(
  offsetFromActive: FeedOffsetFromActive,
  preloadNextEnabled: boolean,
): VideoPreloadStrategy {
  if (offsetFromActive === 0) return "auto";
  if (offsetFromActive === 1 && preloadNextEnabled) return "auto";
  return "metadata";
}

export type VideoFitMode = "cover" | "contain";

/**
 * Decides how a video should fill its full-bleed 9:16 frame. Portrait source
 * video (the overwhelming default) fills the frame edge-to-edge; anything
 * closer to square or landscape switches to "contain" so the subject isn't
 * cropped — pair this with a blurred cover-fill backdrop layer, the same
 * treatment Reels/TikTok use for non-vertical uploads.
 */
export function resolveVideoFitMode(aspectRatio?: string | null): VideoFitMode {
  const ratio = parseAspectRatio(aspectRatio);
  if (ratio === null) return "cover";
  // 0.8 sits between typical portrait ratios (9:16 = 0.5625, 4:5 = 0.8) and
  // square/landscape (1:1 = 1, 16:9 = 1.78) — portrait-ish stays cropped-fill.
  return ratio <= 0.8 ? "cover" : "contain";
}

function parseAspectRatio(aspectRatio?: string | null): number | null {
  if (!aspectRatio) return null;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return width / height;
}

export type FeedVisibilityEntry = {
  isIntersecting: boolean;
  intersectionRatio: number;
  videoId: string | null;
};

/**
 * Picks which video the IntersectionObserver considers "active" — the most
 * visible intersecting section. Takes plain objects (not IntersectionObserverEntry)
 * so it's testable without a real observer/DOM.
 */
export function pickMostVisibleVideoId(
  entries: FeedVisibilityEntry[],
): string | null {
  const mostVisible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
  return mostVisible?.videoId ?? null;
}

/**
 * The buffering spinner should only cover the video the viewer is actually
 * watching, only while it's genuinely stalled (not paused by the viewer),
 * and only over a real playable video (the thumbnail-only placeholder has
 * nothing to buffer).
 */
export function shouldShowBufferingSpinner(state: {
  hasRealVideo: boolean;
  isActiveVideo: boolean;
  isBuffering: boolean;
  isPaused: boolean;
}): boolean {
  return (
    state.isActiveVideo &&
    state.isBuffering &&
    !state.isPaused &&
    state.hasRealVideo
  );
}

export type FeedNavigationKey = "ArrowUp" | "ArrowDown" | (string & {});

/**
 * Arrow-key feed navigation (desktop parity with swipe): Up moves to the
 * previous video, Down to the next one. Clamped to the list bounds rather
 * than wrapping, matching the scroll-snap container's own end-stop behavior.
 * Returns null for any other key or when the move would be a no-op.
 */
export function resolveKeyboardNavigationIndex(
  key: FeedNavigationKey,
  currentIndex: number,
  videoCount: number,
): number | null {
  if (videoCount <= 0) return null;
  let nextIndex: number;
  if (key === "ArrowDown") nextIndex = currentIndex + 1;
  else if (key === "ArrowUp") nextIndex = currentIndex - 1;
  else return null;
  if (nextIndex < 0 || nextIndex > videoCount - 1) return null;
  return nextIndex;
}
