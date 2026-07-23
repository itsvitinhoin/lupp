// Lupp widget – floating launcher: DOM, drag persistence and impression
// tracking.
import { escapeHtml, normalizedHostname } from "../utils";
import { primeInlineVideos } from "../hls";
import { ctx, videoMediaUrl } from "../context";
import { openFeedOverlay } from "../feed";
import type { SlimVideo, StorePayload } from "../types";

function shouldAutoplayLauncherPreview(): boolean {
  return ctx.previewMode !== "performance";
}

var trackedLauncherImpressions: Record<string, boolean> = {};

function positionStyles(): string {
  if (ctx.nubesdkFrameMode === "launcher") {
    return "position:relative;z-index:1;left:0;top:0;right:auto;bottom:auto";
  }
  var styles = ["position:fixed", "z-index:2147483000"];
  var x = ctx.launcherConfig.offsetX + "px";
  var y = ctx.launcherConfig.offsetY + "px";

  if (ctx.launcherConfig.position.indexOf("top") === 0) styles.push("top:" + y);
  else styles.push("bottom:" + y);

  if (ctx.launcherConfig.position.indexOf("right") > -1)
    styles.push("right:" + x);
  else styles.push("left:" + x);

  return styles.join(";");
}

function launcherDragStorageKey(store: StorePayload | null): string {
  var storeKey =
    (store && (store.id || store.slug)) ||
    ctx.storeId ||
    ctx.externalStoreId ||
    ctx.storeSlug ||
    "default";
  return [
    "lupp_launcher_position_v1",
    normalizedHostname(window.location.hostname || "store"),
    String(storeKey),
  ].join(":");
}

function readLauncherDragPosition(
  store: StorePayload | null,
): { x: number; y: number } | null {
  try {
    if (!window.localStorage) return null;
    var raw = window.localStorage.getItem(launcherDragStorageKey(store));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    var x = Number(parsed && parsed.x);
    var y = Number(parsed && parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x, y: y };
  } catch (_) {
    return null;
  }
}

function saveLauncherDragPosition(
  store: StorePayload | null,
  position: { x: number; y: number } | null,
): void {
  try {
    if (!window.localStorage || !position) return;
    window.localStorage.setItem(
      launcherDragStorageKey(store),
      JSON.stringify({
        x: Math.round(position.x),
        y: Math.round(position.y),
      }),
    );
  } catch (_) {}
}

function clampLauncherPosition(
  root: HTMLElement,
  x: number,
  y: number,
): { x: number; y: number } {
  var rect = root.getBoundingClientRect
    ? root.getBoundingClientRect()
    : { width: 80, height: 80 };
  var margin = 8;
  var maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  var maxY = Math.max(margin, window.innerHeight - rect.height - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

function applyLauncherDragPosition(
  root: HTMLElement,
  position: { x: number; y: number } | null,
): void {
  if (!position) return;
  root.style.left = position.x + "px";
  root.style.top = position.y + "px";
  root.style.right = "auto";
  root.style.bottom = "auto";
}

function installLauncherDrag(
  root: HTMLElement,
  button: HTMLElement | null,
  store: StorePayload,
): void {
  var flaggedButton = button as
    | (HTMLElement & { __luppDragInstalled?: boolean })
    | null;
  if (!root || !flaggedButton || flaggedButton.__luppDragInstalled) return;
  flaggedButton.__luppDragInstalled = true;

  interface DragState {
    moved: boolean;
    pendingDeltaX: number;
    pendingDeltaY: number;
    startLeft: number;
    startTop: number;
    startX: number;
    startY: number;
    lastPosition: { x: number; y: number } | null;
  }
  var state: DragState | null = null;
  var previousUserSelect = "";
  var pendingMoveFrame: number | null = null;

  function pointFromEvent(event: Event): { x: number; y: number } {
    var touchEvent = event as TouchEvent;
    var source: { clientX?: number; clientY?: number } =
      touchEvent.touches && touchEvent.touches.length
        ? touchEvent.touches[0]
        : touchEvent.changedTouches && touchEvent.changedTouches.length
          ? touchEvent.changedTouches[0]
          : (event as MouseEvent);
    return {
      x: Number(source.clientX || 0),
      y: Number(source.clientY || 0),
    };
  }

  function setSuppressClick() {
    root.setAttribute("data-lupp-suppress-click", "true");
    window.setTimeout(function () {
      root.removeAttribute("data-lupp-suppress-click");
    }, 260);
  }

  // getBoundingClientRect (inside clampLauncherPosition) + the style writes
  // it feeds only need to happen once per paint, not once per mousemove
  // event — batching them into a rAF avoids layout thrashing on lower-end
  // devices while dragging.
  function flushPendingMove() {
    pendingMoveFrame = null;
    if (!state) return;
    var position = clampLauncherPosition(
      root,
      state.startLeft + state.pendingDeltaX,
      state.startTop + state.pendingDeltaY,
    );
    applyLauncherDragPosition(root, position);
    state.lastPosition = position;
  }

  function onMove(event: Event) {
    if (!state) return;
    var point = pointFromEvent(event);
    var deltaX = point.x - state.startX;
    var deltaY = point.y - state.startY;
    if (!state.moved && Math.sqrt(deltaX * deltaX + deltaY * deltaY) < 7) {
      return;
    }

    state.moved = true;
    if (event.cancelable) event.preventDefault();
    root.setAttribute("data-lupp-dragging", "true");
    document.body.style.userSelect = "none";
    state.pendingDeltaX = deltaX;
    state.pendingDeltaY = deltaY;
    if (pendingMoveFrame === null) {
      pendingMoveFrame = requestAnimationFrame(flushPendingMove);
    }
  }

  function onEnd() {
    if (!state) return;
    if (pendingMoveFrame !== null) {
      cancelAnimationFrame(pendingMoveFrame);
      flushPendingMove();
    }
    if (state.moved && state.lastPosition) {
      saveLauncherDragPosition(store, state.lastPosition);
      setSuppressClick();
    }
    document.body.style.userSelect = previousUserSelect;
    root.removeAttribute("data-lupp-dragging");
    removeListeners();
    state = null;
  }

  function addListeners() {
    document.addEventListener("mousemove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }

  function removeListeners() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);
  }

  function onStart(event: Event) {
    if (event.type === "mousedown" && (event as MouseEvent).button !== 0) {
      return;
    }
    var point = pointFromEvent(event);
    var rect = root.getBoundingClientRect();
    previousUserSelect = document.body.style.userSelect;
    state = {
      moved: false,
      pendingDeltaX: 0,
      pendingDeltaY: 0,
      startLeft: rect.left,
      startTop: rect.top,
      startX: point.x,
      startY: point.y,
      lastPosition: null,
    };
    addListeners();
  }

  flaggedButton.addEventListener("mousedown", onStart);
  flaggedButton.addEventListener("touchstart", onStart, { passive: true });
}

function trackLauncherImpression(
  root: HTMLElement,
  store: StorePayload,
  video: Partial<SlimVideo> | undefined,
): void {
  if (!store || !store.id) return;
  var key = [store.id, ctx.currentProductUrl(), ctx.widgetType].join("|");
  if (trackedLauncherImpressions[key]) return;

  window.setTimeout(function () {
    if (trackedLauncherImpressions[key]) return;
    if (!root || !root.parentNode) return;
    var button = root.querySelector("[data-lupp-launcher]");
    if (!button) return;
    var style = window.getComputedStyle
      ? window.getComputedStyle(button)
      : null;
    if (style && (style.display === "none" || style.visibility === "hidden")) {
      return;
    }
    var rect = button.getBoundingClientRect
      ? button.getBoundingClientRect()
      : { width: 1, height: 1 };
    if (rect.width <= 0 || rect.height <= 0) return;

    trackedLauncherImpressions[key] = true;
    ctx.track(store.id, "launcher_impression", video && video.id ? video.id : null, null, {
      launcher_position: ctx.launcherConfig.position,
      launcher_model: ctx.launcherConfig.model,
      launcher_size: ctx.launcherConfig.bubbleSize,
      has_video_preview: !!(video && videoMediaUrl(video)),
    });
  }, 250);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Animate the bubble in only the first time it mounts in this page session —
// re-renders (URL changes, viewport-breakpoint re-slices, status refreshes)
// must not replay the pop-in, or it would flash every time the widget
// re-evaluates its state.
function launcherEntranceStyle(root: HTMLElement): string {
  if (root.getAttribute("data-lupp-launcher-mounted") === "true" || prefersReducedMotion()) {
    return "";
  }
  root.setAttribute("data-lupp-launcher-mounted", "true");
  return "opacity:0;transform:scale(.6);animation:lupp-launcher-in .32s cubic-bezier(.34,1.56,.64,1) forwards;";
}

export function renderLauncher(
  root: HTMLElement,
  store: StorePayload,
  videos: SlimVideo[],
): void {
  var video = videos[0] || {};
  var size = Math.max(56, ctx.launcherConfig.bubbleSize);
  var model = ctx.launcherConfig.model || "circular";
  var isRectangular = model === "rectangular";
  var isSquare = model === "square";
  var isInsta = model.indexOf("insta") > -1 || model === "highlight";
  var width = isRectangular ? Math.round(size * 1.35) : size;
  var height = isRectangular ? Math.round(size * 0.78) : size;
  var radius = isRectangular || isSquare ? "18px" : "999px";
  var mediaRadius = radius;
  var ring = isInsta
    ? "linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)"
    : ctx.launcherConfig.backgroundColor;
  var mediaUrl = videoMediaUrl(video);
  var media =
    shouldAutoplayLauncherPreview() && mediaUrl
      ? '<video muted playsinline loop autoplay preload="metadata" data-lupp-video-src="' +
        escapeHtml(mediaUrl) +
        '" poster="' +
        escapeHtml(video.thumbnail_url || "") +
        '" style="width:100%;height:100%;object-fit:cover;border-radius:' +
        mediaRadius +
        ';background:#111"></video>'
      : video.thumbnail_url
        ? '<span aria-hidden="true" style="display:block;width:100%;height:100%;border-radius:' +
      mediaRadius +
      ";background:#111 center/cover no-repeat;background-image:url('" +
      escapeHtml(video.thumbnail_url || "") +
      "')\"></span>"
        : '<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:' +
          ctx.launcherConfig.textColor +
          '">▶</span>';

  root.style.cssText =
    positionStyles() +
    ";will-change:transform,left,top;touch-action:none;-webkit-user-select:none;user-select:none;";
  root.innerHTML =
    "<style>@keyframes lupp-launcher-in{to{opacity:1;transform:scale(1)}}</style>" +
    '<button type="button" data-lupp-launcher aria-label="' +
    escapeHtml(ctx.launcherConfig.label || "Assista e compre pelo vídeo") +
    '" style="' +
    "display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:0;cursor:grab;touch-action:none;font-family:" +
    ctx.launcherConfig.fontFamily +
    ";filter:drop-shadow(0 14px 28px rgba(0,0,0,.28));" +
    launcherEntranceStyle(root) +
    '">' +
    '<span style="position:relative;display:block;width:' +
    width +
    "px;height:" +
    height +
    "px;border-radius:" +
    radius +
    ";background:" +
    ring +
    ";border:3px solid #fff;box-shadow:0 0 0 2px " +
    ctx.launcherConfig.accentColor +
    ',0 12px 32px rgba(0,0,0,.32);overflow:hidden">' +
    (isInsta
      ? '<span style="display:block;width:100%;height:100%;padding:3px;box-sizing:border-box;border-radius:' +
        radius +
        '">'
      : "") +
    media +
    (isInsta ? "</span>" : "") +
    '<span style="position:absolute;right:3px;bottom:3px;width:17px;height:17px;border-radius:999px;background:' +
    ctx.launcherConfig.accentColor +
    ';border:2px solid #fff"></span></span>' +
    (ctx.launcherConfig.label
      ? '<span style="max-width:158px;border-radius:999px;background:' +
        ctx.launcherConfig.backgroundColor +
        ";color:" +
        ctx.launcherConfig.textColor +
        ';padding:8px 12px;font-size:12px;font-weight:800;line-height:1.15;white-space:nowrap">' +
        escapeHtml(ctx.launcherConfig.label) +
        "</span>"
      : "") +
    "</button>";

  if (shouldAutoplayLauncherPreview() && mediaUrl) {
    primeInlineVideos(root);
  }

  trackLauncherImpression(root, store, video);

  var launcherButton = root.querySelector(
    "[data-lupp-launcher]",
  ) as HTMLElement;
  var storedPosition = readLauncherDragPosition(store);
  if (storedPosition) {
    applyLauncherDragPosition(
      root,
      clampLauncherPosition(root, storedPosition.x, storedPosition.y),
    );
  }
  installLauncherDrag(root, launcherButton, store);
  launcherButton.addEventListener("click", function (event) {
    if (root.getAttribute("data-lupp-suppress-click") === "true") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    openFeedOverlay(store, video.id, video);
  });
}
