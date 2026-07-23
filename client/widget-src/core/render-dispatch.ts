// Lupp widget – top-level render dispatch: picks which DOM renderer a
// widgetType maps to and owns the widget root element's lifecycle.
import { debugLog, emitWidgetRendered, escapeHtml } from "../utils";
import { primeInlineVideos } from "../hls";
import { ctx } from "../context";
import { openFeedOverlay } from "../feed";
import { renderLauncher } from "../render/launcher";
import { removeHomeCarouselRoot, renderCarousel, renderEmbeddedHomeCarousel } from "../render/carousel";
import { isCarouselWidgetType, isFloatingWidgetType } from "./widget-type";
import type { SlimVideo, StorePayload } from "../types";

export function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-lupp-widget-root", ctx.widgetType);
  if (
    isCarouselWidgetType(ctx.widgetType) &&
    ctx.script &&
    ctx.script.parentNode &&
    ctx.script.parentNode !== document.head &&
    ctx.script.parentNode !== document.documentElement
  ) {
    ctx.script.parentNode.insertBefore(root, ctx.script.nextSibling);
    return root;
  }
  (document.body || document.documentElement).appendChild(root);
  return root;
}

function ensureRootAttached(root: HTMLElement): void {
  if (!root.parentNode) {
    (document.body || document.documentElement).appendChild(root);
  }
}

function renderStoriesBar(root: HTMLElement, store: StorePayload, videos: SlimVideo[]): void {
  const accent = ctx.launcherConfig.accentColor || store.button_color || "#006BFF";
  root.innerHTML =
    '<div style="font-family:' +
    ctx.launcherConfig.fontFamily +
    ';display:flex;gap:12px;overflow:auto;padding:10px 0;color:#111">' +
    videos
      .slice(0, 8)
      .map((video) => {
        return (
          '<button data-video="' +
          video.id +
          '" style="border:0;background:transparent;color:inherit;width:76px;cursor:pointer">' +
          '<span style="display:block;width:64px;height:64px;border:2px solid ' +
          accent +
          ";border-radius:999px;background:#121B33 center/cover no-repeat;background-image:url(" +
          escapeHtml(video.thumbnail_url || "") +
          ')"></span>' +
          '<span style="display:block;margin-top:6px;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
          escapeHtml(video.title) +
          "</span></button>"
        );
      })
      .join("") +
    "</div>";

  primeInlineVideos(root);

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("[data-video]");
    if (!button) return;
    openFeedOverlay(store, button.getAttribute("data-video"));
  });
}

function render(root: HTMLElement, store: StorePayload, videos: SlimVideo[]): void {
  if (!videos.length && isFloatingWidgetType(ctx.widgetType)) {
    renderLauncher(root, store, []);
    emitWidgetRendered({ videoCount: 0, widgetType: ctx.widgetType });
    return;
  }

  if (!videos.length) {
    root.innerHTML = "";
    return;
  }

  if (ctx.widgetType === "stories_bar") {
    renderStoriesBar(root, store, videos);
    emitWidgetRendered({ videoCount: videos.length, widgetType: ctx.widgetType });
    return;
  }

  if (isFloatingWidgetType(ctx.widgetType)) {
    renderLauncher(root, store, videos);
    emitWidgetRendered({ videoCount: videos.length, widgetType: ctx.widgetType });
    return;
  }

  renderCarousel(root, store, videos);
  emitWidgetRendered({ videoCount: videos.length, widgetType: ctx.widgetType });
}

export function renderForCurrentUrl(root: HTMLElement): void {
  const store = ctx.sharedState.activeStore;
  if (!store) return;
  ctx.lastRenderedUrl = window.location.href;

  if (isCarouselWidgetType(ctx.widgetType) && ctx.carouselConfig.enabled === false) {
    debugLog("render skipped: carousel disabled", {
      hint: "settings.carousel.enabled=false ou data-home-carousel-enabled=false",
    });
    root.innerHTML = "";
    removeHomeCarouselRoot();
    return;
  }

  ensureRootAttached(root);
  // Videos already arrive filtered and ordered for the current page.
  const pageVideos = ctx.activeVideos;
  if (ctx.hasLoadedVideoList && !pageVideos.length && ctx.displayConfig.hideWithoutVideos) {
    debugLog("render skipped: hide_without_videos and no matching videos");
    root.innerHTML = "";
    removeHomeCarouselRoot();
    return;
  }
  debugLog("render", { videoCount: pageVideos.length, widgetType: ctx.widgetType });
  render(root, store, pageVideos);
  renderEmbeddedHomeCarousel(pageVideos, root);
}
