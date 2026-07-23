// Lupp widget – context-mode bootstrap request: the request carries the page
// URL (plus product hints) and the server answers with pre-filtered,
// pre-ordered videos, pre-formatted product fields and a fully evaluated
// display/config block, so the browser no longer filters, merges or formats
// anything (see server/src/http/widget/context.ts, kept in lockstep).
import { debugLog, getUrlOrigin, getUrlPathname, resolveUrl } from "../utils";
import { ctx } from "../context";
import { isCarouselWidgetType, mapToServerWidgetType } from "./widget-type";
import { currentExternalProductId } from "./upzero-product-url";
import type { BootstrapPayload } from "../types";

// Whether this widgetType/store-identity combination is eligible to call
// bootstrap at all — evaluated once at startup as part of main.ts's initial
// gate. Keyless (identity-free) embeds are only allowed for widget types
// that make sense without one (the floating launcher/video and every
// carousel variant infer identity from platform globals instead).
export function canRequestBootstrap(params: {
  widgetType: string;
  externalStoreId: string;
  storeDomain: string;
  storeSlug: string;
}): boolean {
  return (
    params.widgetType === "floating_launcher" ||
    params.widgetType === "floating_video" ||
    isCarouselWidgetType(params.widgetType) ||
    Boolean(params.externalStoreId) ||
    Boolean(params.storeDomain) ||
    Boolean(params.storeSlug)
  );
}

// Sandboxed pages (about:srcdoc / blob: iframes such as the dashboard
// simulator) expose no usable origin; data-product-url then drives the page
// context, with the Lupp app origin as the last-resort parseable URL.
function hasUsablePageOrigin(): boolean {
  try {
    const origin = window.location.origin;
    if (!origin || origin === "null") return false;
    return !/^(about|blob):/i.test(String(window.location.protocol || ""));
  } catch (_) {
    return false;
  }
}

export function contextUrl(): string {
  let raw: string;
  if (ctx.nubesdkFrameMode && ctx.configuredProductUrl) {
    raw = ctx.configuredProductUrl;
  } else if (hasUsablePageOrigin()) {
    raw = window.location.href;
  } else if (ctx.configuredProductUrl) {
    raw = ctx.configuredProductUrl;
  } else {
    return getUrlOrigin(ctx.luppBaseUrl) + "/";
  }
  const resolved = resolveUrl(raw, window.location.href);
  // origin + pathname only (no query/hash) to keep cache keys tight.
  return getUrlOrigin(resolved) + getUrlPathname(resolved, window.location.href);
}

export function fetchBootstrap(): Promise<BootstrapPayload> {
  const params = new URLSearchParams();
  const externalProvider = /\.myshopify\.com$/i.test(String(ctx.externalStoreId || "")) ? "shopify" : "nuvemshop";
  params.set("widget", mapToServerWidgetType(ctx.widgetType));
  params.set("url", contextUrl());
  if (ctx.configuredProductUrl) {
    params.set("product_url", ctx.configuredProductUrl);
  }
  const externalProductId = currentExternalProductId();
  if (externalProductId) {
    params.set("external_product_id", externalProductId);
  }
  if (ctx.storeId) {
    // A Lupp store id is authoritative: it alone resolves the store, so the
    // weaker identifiers (slug / external id / domain) stay home and the
    // server takes its fastest resolution path.
    params.set("store_id", ctx.storeId);
  } else {
    if (ctx.storeSlug) params.set("store_slug", ctx.storeSlug);
    if (ctx.externalStoreId) {
      params.set("provider", externalProvider);
      params.set("external_store_id", ctx.externalStoreId);
    } else if (ctx.storeDomain) {
      params.set("provider", externalProvider);
      params.set("store_domain", ctx.storeDomain);
    }
  }

  const bootstrapUrl = ctx.bootstrapBase + "?" + params.toString();
  debugLog("bootstrap request", bootstrapUrl);
  return fetch(bootstrapUrl).then((response) => {
    if (!response.ok) {
      debugLog("bootstrap failed", { status: response.status });
      throw new Error("Luup bootstrap error: " + response.status);
    }
    return response.json().then((payload) => {
      debugLog("bootstrap payload", {
        active: payload && payload.active,
        error: (payload && payload.error) || null,
        mode: (payload && payload.mode) || null,
        show: payload && payload.display ? payload.display.show !== false : null,
        reason: (payload && payload.display && payload.display.reason) || null,
        resolvedBy: (payload && payload.resolved_by) || null,
        videoCount: payload && payload.videos && payload.videos.length ? payload.videos.length : 0,
      });
      return payload;
    });
  });
}
