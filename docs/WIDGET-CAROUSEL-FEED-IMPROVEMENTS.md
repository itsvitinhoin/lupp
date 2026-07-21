# Widget, Carousel & Feed — Improvement Backlog

Mapped by scanning `client/widget-src/` (bootstrap, overlay, launcher,
carousel), `client/src/pages/preview/feed.tsx` and
`client/src/components/shared/LazyVideoPlayer.tsx` for correctness,
performance, accessibility, and testability gaps not already covered by the
Reels-parity pass (buffering spinner, directional preload, aspect-ratio fit
mode, IntersectionObserver lazy loading, overlay/launcher entrance
animations, carousel resize re-slicing, `home_ordering` fix, "start high /
release on real buffering" HLS quality policy).

Status legend: ✅ implemented this pass · ⏸ deferred (rationale inline).

## Widget core (`widget-src/overlay.ts`, `main.ts`, `render/launcher.ts`)

- ✅ **Double frame reload on every overlay open for non-Upzero stores** —
  `overlay.ts` set the feed iframe's `src` synchronously, then unconditionally
  awaited `ctx.detectCustomerStatus(...)` and set it again. For non-Upzero
  stores (the overwhelming majority) that promise still resolved to a
  different-shaped status object, so the iframe silently reloaded a second
  time on almost every launcher click. Fixed by skipping the async re-check
  entirely when the store isn't Upzero (`detectCustomerStatus`'s own
  non-Upzero fast path is side-effect-free, confirmed by reading `main.ts`).
- ✅ **Leaked `keydown` listener on every non-Escape overlay close** — the
  Escape handler only removed itself on an actual Escape press; closing via
  the × button or backdrop click left it attached to `document` forever,
  accumulating one stale listener per open/close cycle and letting a later
  Escape press replay `showFeedbackForm()` against an already-destroyed
  overlay. Fixed by unifying Escape + Tab handling into one
  `onOverlayKeydown` that's always removed in `destroyOverlay`.
- ✅ **No focus trap / dialog semantics on the overlay** — added
  `role="dialog"`/`aria-modal="true"`/`aria-label`, a Tab/Shift+Tab trap
  scoped to the overlay's focusable elements, focus moved to the close
  button on open, and focus restored to whatever was focused before opening
  (the launcher button) on close.
- ✅ **Feedback star buttons conveyed selection by color only** — added
  `aria-pressed` to each star button.
- ✅ **`100dvh` with no fallback** — browsers without dynamic-viewport-unit
  support (Safari <15.4, older Chromium) got no explicit iframe height at
  all. Added a `100vh` declaration before the `100dvh` one (later
  declaration wins where understood, first is the fallback).
- ✅ **Out-of-order bootstrap race on first load** — `watchUrlChanges` starts
  listening before `runAfterPageReady` even schedules `startWidget`, so an
  SPA navigation firing while the very first `fetchBootstrap()` is still in
  flight could have its (correctly-guarded) `refreshContextForUrl` response
  overwritten by the late-arriving, unguarded initial fetch. Fixed by
  routing `startWidget`'s own fetch through the same `lastRequestedContextUrl`
  guard `refreshContextForUrl` already used.
- ✅ **Launcher button had no accessible name when the label is empty** — a
  supported, empty `data-label` config left the button with no `aria-label`
  and no visible text. Added a fallback label.
- ✅ **Unthrottled launcher drag** — `onMove` ran `getBoundingClientRect` +
  style writes synchronously on every raw `mousemove`/`touchmove`, unlike
  the rest of the codebase's rAF-batched visual updates. Coalesced into a
  single `requestAnimationFrame` flush per paint; `preventDefault()` still
  fires synchronously so touch-scroll suppression is unaffected.
- ⏸ **Adapter/script load retry with backoff** (`main.ts` `loadAdapter`,
  `nuvemshop-script.js`) — a single transient CDN blip currently disables
  cart-add/customer-status features (or the whole widget) for the rest of
  the session with no retry. Deferred: a real fix needs a retry/backoff
  policy and a decision on user-facing signaling, which is a design
  decision beyond a mechanical fix — flagged for a follow-up conversation.
- ⏸ **Upzero URL/slug helpers untested** (`main.ts`: `normalizePath`,
  `extractProductHandle`, `slugifyForPath`,
  `upzeroReferenceSlugFromProduct`, `upzeroProductHandleFromProduct`,
  `repairUpzeroProductUrl`) — dense regex-driven pure logic that deserves
  the same extraction-to-a-testable-module treatment as
  `resolveCarouselItemLimit`. Deferred: ~6 functions with real behavioral
  nuance (Upzero-specific slugging rules) that warrant a dedicated,
  carefully-reviewed pass rather than a mechanical cut in this batch.

## Carousel (`widget-src/render/carousel.ts`)

- ✅ **Double-injection with no cross-instance guard** — `homeCarouselRoot`
  is a module-level singleton, so a duplicate embed `<script>` tag (its own
  independent module instance) had no way to see a carousel root a
  *different* instance already created, and would inject a second one.
  Fixed by checking the live DOM for an existing
  `[data-lupp-widget-root="home_carousel"]` node before creating one.
- ✅ **Unthrottled anchor-discovery `MutationObserver`** — it observed
  `document.body` subtree with no debounce, re-running several
  full-document `querySelectorAll` scans on every mutation batch; SPA
  hydration/animation churn could fire this dozens of times per second.
  Debounced to one check per 150ms of quiet.
- ✅ **Entrance animation played invisibly off-screen** — the stagger
  fade-in fired unconditionally at render time via CSS
  `animation-delay`, even when the carousel was anchored far down the page
  — anyone scrolling to it later had already missed the reveal. Cards now
  render `--pending` (invisible, no animation) and only switch to
  `--entrance` once an `IntersectionObserver` confirms the section is
  actually visible (with a `data-lupp-carousel-entrance-triggered` guard so
  re-renders from a breakpoint change or Upzero status refresh don't replay
  it). Falls back to the old immediate-animate behavior when
  `IntersectionObserver` isn't supported.
- ✅ **No edge-scroll affordance** — added a subtle left/right gradient
  fade over the track, the standard "there's more to scroll" hint for an
  overflow-x list with a hidden scrollbar.
- ✅ **Accessibility: track not keyboard-scrollable, no focus-visible ring
  on cards** — added `role="region"`/`aria-label`/`tabindex="0"` to the
  track (native arrow-key scroll once focused) and an explicit
  `:focus-visible` outline on both the track and each card (previously
  relied on invisible UA default against the dark product overlay).
- ✅ **`findHomeBenefitsSection`'s keyword scoring was untestable** —
  extracted the scoring block into a pure `scoreBenefitsSectionText(text)` +
  `HOME_BENEFITS_SECTION_MIN_SCORE`, unit-tested independently of the DOM
  candidate-gathering it used to be inlined into.
- ⏸ **No loading skeleton for the pre-bootstrap window (CLS)** — the
  carousel only exists once the one-shot bootstrap response resolves, so a
  true zero-CLS skeleton would need to render *before* the response tells
  us whether the carousel should even show (`show_home_carousel` is
  server-evaluated). That's a real architecture change (speculative
  pre-render + reconciliation), not a mechanical fix — deferred.
- ⏸ **No drag-to-scroll or arrow-nav buttons on desktop** — real feature
  work (pointer-based drag matching the launcher's own drag handling,
  click-vs-drag disambiguation, prev/next buttons with disabled-at-ends
  state). Deferred as a scoped follow-up rather than rushed alongside this
  batch of fixes.
- ⏸ **Anchor removal isn't watched after successful placement** — once
  the carousel is placed, nothing re-validates if the anchor later vanishes
  from a client-side re-render (no URL change). Deferred: needs a
  disconnect-on-navigate observer scoped correctly to avoid reintroducing
  the same unscoped-`MutationObserver` cost this pass just fixed elsewhere.
- ⏸ **Context/legacy parity is a comment-level promise, not a test** —
  `context.ts` must mirror the legacy no-`url` widget.js path, but that
  script isn't in this repo and there's no fixture-diff test. Tracked as a
  follow-up; needs the legacy fixture to test against, not a code change.

## Feed & player (`src/pages/preview/feed.tsx`, `src/components/shared/LazyVideoPlayer.tsx`)

- ✅ **Video playback failures were completely silent** — neither the
  native `<video>` `error` event nor fatal `Hls.Events.ERROR` were
  listened for; a 404'd manifest or failed segment just left the poster
  frozen forever with no retry. Added `onPlaybackError` to
  `LazyVideoPlayer` (native error + fatal HLS errors both reported), and a
  per-video "Não foi possível carregar este vídeo" overlay with a retry
  button (remounts just that video via a `key` bump).
- ✅ **Feed fetch failure was indistinguishable from an empty store** —
  `feedQuery.isError` was never read; a network failure rendered the exact
  same "Nenhum vídeo ativo" message as a legitimately empty catalog. Added
  a distinct error state with a retry button that calls `feedQuery.refetch()`.
- ✅ **`pointercancel` left the 2×-speed long-press timer armed** — only
  `pointerup` cleared `longPressTimerRef`; a `pointercancel` (the
  scroll/snap gesture recognizer taking over mid-press, common on this
  exact swipe gesture) left the timer running, so it fired ~420ms later
  against whatever video the stale closure captured — an unexplainable
  "video sped up on its own" bug. Fixed by clearing the timer in
  `resetSpeed` too.
- ✅ **Mute preference wasn't persisted** — every fresh page load reset to
  muted-autoplay regardless of the visitor's last explicit choice in the
  same browser. Added a `localStorage`-backed preference
  (`lupp_feed_sound_preference`).
- ✅ **Mock-mode video list churned on every render** — `videos` recomputed
  `mockVideos.filter(...)` (a fresh array) on every render in local/dev
  preview mode, invalidating `orderedVideos`/`productViewsByVideoId` and
  tearing down/recreating the active-video `IntersectionObserver` on
  unrelated state changes (a like tap, a mute toggle). Memoized. (Real
  store traffic was largely unaffected already, since `feedQuery.data`
  keeps a stable reference across renders — but the fix makes this
  explicit and robust rather than incidental.)
- ✅ **Scroll→active-video and buffering-spinner logic were untestable
  inline** — extracted `pickMostVisibleVideoId` (the IntersectionObserver
  entries → active id decision) and `shouldShowBufferingSpinner` into
  `feed-playback.ts`, unit-tested, matching the existing
  `resolvePreloadStrategy`/`resolveVideoFitMode` pattern.
- ✅ **No keyboard navigation** — added a window-level Up/Down arrow
  handler (skips when a text field has focus) via a new pure
  `resolveKeyboardNavigationIndex` helper, scrolling to the target
  video's section.
- ✅ **No per-video progress indicator** — added a thin top-of-frame
  progress bar driven by a `timeupdate` listener, composed into the video
  ref callback alongside the existing ref-registration.
- ✅ **Swipe-hint bounce ignored `prefers-reduced-motion`** — gated the
  `animate-bounce` class on the OS reduce-motion setting (new shared
  `prefersReducedMotion()` helper in `src/lib/utils.ts`).
- ⏸ **HLS instance fully destroyed/rebuilt on every ±1-window exit/re-entry**
  — quick back-and-forth swiping (a common rebound/overscroll gesture)
  destroys and reinstantiates the `Hls` instance for a video that may have
  already buffered, replaying the whole quality-pin cold start. A real fix
  needs an LRU-ish cache of live `Hls` instances keyed by video id, which
  interacts with the quality-pin/buffering-release logic just added in the
  previous pass — deferred as its own focused change rather than layered on
  top of this batch.
- ⏸ **No double-tap-to-like / haptic-style tap feedback** — feature work
  (Reels/TikTok parity nice-to-have), not a correctness or robustness gap;
  deferred to keep this pass scoped to fixes + testability + accessibility.

## Verification performed for everything marked ✅

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p widget-src/tsconfig.json
  --noEmit` — clean.
- `npx vitest run` — 34/34 passing (20 new/updated assertions across
  `feed-playback.spec.ts`, `video-buffering.spec.ts`, `carousel.spec.ts`).
- `npm run build:widget` run twice, `sha1sum`-compared — byte-identical
  (determinism preserved).
- `npm run build` (production SPA) — succeeds.
