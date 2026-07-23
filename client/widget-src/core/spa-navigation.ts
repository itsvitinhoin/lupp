// Lupp widget – SPA navigation watching. Navigations are not filtered
// client-side: a URL change re-fetches context-mode bootstrap for the new
// page (the browser HTTP cache + ETag makes repeat visits cheap), and only
// the latest requested URL may render (out-of-order guard via
// ctx.lastRequestedContextUrl).
import { debugLog } from "../utils";
import { ctx } from "../context";
import { removeHomeCarouselRoot } from "../render/carousel";
import { fetchBootstrap } from "./bootstrap-client";
import { applyContextConfig } from "./embed-config";
import { CAROUSEL_MOBILE_BREAKPOINT } from "./constants";

export function refreshContextForUrl(root: HTMLElement): void {
  const requestedUrl = window.location.href;
  ctx.lastRequestedContextUrl = requestedUrl;
  fetchBootstrap()
    .then((payload) => {
      if (ctx.lastRequestedContextUrl !== requestedUrl) return;
      applyContextConfig(payload.config);
      ctx.activeVideos = payload.videos || [];
      ctx.hasLoadedVideoList = true;
      ctx.contextDisplay = payload.display || {};
      const display = ctx.contextDisplay;
      if (display.show === false) {
        debugLog("render skipped: server display rules", { reason: display.reason || null });
        ctx.lastRenderedUrl = requestedUrl;
        root.innerHTML = "";
        removeHomeCarouselRoot();
        return;
      }
      ctx.renderForCurrentUrl(root);
    })
    .catch((error) => {
      debugLog("context refresh failed", error.message);
    });
}

export function watchUrlChanges(root: HTMLElement): void {
  function scheduleRender() {
    window.setTimeout(() => {
      if (window.location.href === ctx.lastRenderedUrl) return;
      refreshContextForUrl(root);
    }, 80);
  }

  (["pushState", "replaceState"] as const).forEach((method) => {
    const original = history[method];
    if (typeof original !== "function") return;
    history[method] = function (this: History) {
      const result = original.apply(this, arguments as unknown as Parameters<History["pushState"]>);
      scheduleRender();
      return result;
    };
  });

  window.addEventListener("popstate", scheduleRender);
  window.addEventListener("hashchange", scheduleRender);
}

// renderCarousel reads matchMedia once per render to pick max_items vs
// mobile_max_items; without this, rotating a tablet or resizing past 640px
// never re-slices the already-rendered carousel until an unrelated re-render
// happens to fire. Re-render only on an actual breakpoint crossing (not
// every resize tick), reusing the already-fetched video list —
// renderForCurrentUrl issues no network request.
export function watchCarouselViewportBreakpoint(root: HTMLElement): void {
  if (typeof window.matchMedia !== "function") return;
  const query = window.matchMedia(CAROUSEL_MOBILE_BREAKPOINT);
  const onBreakpointChange = () => ctx.renderForCurrentUrl(root);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onBreakpointChange);
  } else if (typeof (query as unknown as { addListener?: (fn: () => void) => void }).addListener === "function") {
    // Safari < 14.
    (query as unknown as { addListener: (fn: () => void) => void }).addListener(onBreakpointChange);
  }
}
