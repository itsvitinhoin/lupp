// Lupp widget – core entry. Bundled by build-widget.mjs (esbuild, IIFE) into
// public/widget.js, the embed loaded on merchants' storefronts and injected
// into the dashboard by DashboardVideoWidget.
//
// This file only wires things together: reads the embed's configuration,
// resolves store identity, builds the window bridge platform adapters share
// state through, populates the shared render context (ctx, in context.ts),
// and starts the first render. Every other concern lives in its own module
// under core/ — see widget-src/README.md for the full map. Platform-specific
// code lives in ./platforms/*.ts, built into separate widget-{platform}.js
// bundles the core lazily injects after bootstrap (core/adapter-loader.ts).
import {
  asRecord,
  createAnchor,
  debugLog,
  emitCartEvent,
  emitWidgetAborted,
  escapeHtml,
  getUrlHostname,
  getUrlOrigin,
  getUrlPathname,
  normalizedHostname,
  readQueryValue,
  resolveUrl,
  sameStorefrontHostname,
} from "./utils";
import { ctx, isUpzeroStore } from "./context";
import { isTrustedLuppFrameOrigin, postFrameResponse, preconnectFeedOrigin } from "./feed";
import {
  applyContextConfig,
  buildCarouselConfig,
  buildDisplayConfig,
  buildLauncherConfig,
  readAllRawEmbedValues,
} from "./core/embed-config";
import {
  inferNuvemshopStoreId,
  inferShopifyStoreId,
  isNuvemshopStore,
  isShopifyStore,
  resolveAdapterPlatform,
} from "./core/store-identity";
import { loadAdapter } from "./core/adapter-loader";
import { detectCustomerStatus } from "./core/customer-status";
import {
  flushPendingStorefrontCartRefresh,
  updateNuvemshopCartCounters,
  updateShopifyCartCounters,
  updateUpzeroCartCounters,
} from "./core/cart-sync";
import { currentProductUrl, repairUpzeroProductUrl } from "./core/upzero-product-url";
import { track } from "./core/analytics";
import { canRequestBootstrap, fetchBootstrap } from "./core/bootstrap-client";
import { watchCarouselViewportBreakpoint, watchUrlChanges } from "./core/spa-navigation";
import { watchUpzeroCustomerState } from "./core/upzero-customer-watch";
import { runAfterPageReady } from "./core/load-strategy";
import { createRoot, renderForCurrentUrl } from "./core/render-dispatch";
import { installTopLevelMessageHandlers } from "./core/message-handlers";
import type { BridgeState, LauncherConfig, StorePayload, UpzeroConfig, WidgetBridge } from "./types";

(function () {
  "use strict";

  const scriptElement = document.currentScript as HTMLScriptElement | null;
  if (!scriptElement) return;
  const script: HTMLScriptElement = scriptElement;

  // Lupp REST API host used when data-api-url is absent on a non-localhost
  // page. CONFIRM this hostname before deploying the widget.
  const PROD_API_URL = "https://luup.dzns.net";

  // No ES2015+ polyfills: the gate below already excludes any browser old
  // enough to lack Array.find / Number.isFinite / Math.trunc / closest.
  if (!window.Promise || !window.fetch) {
    if (window.console && console.warn) {
      console.warn("[Luup] Este navegador não possui recursos mínimos para carregar o widget.");
    }
    return;
  }

  const raw = readAllRawEmbedValues(script);

  const storeId = raw.storeId;
  const storeSlug = raw.storeSlug;
  const widgetType = raw.widgetType.replace(/-/g, "_");
  const nubesdkFrameMode = raw.nubesdkFrameMode;
  const configuredProductUrl = raw.productUrl;
  const configuredProductId = raw.productId;
  let apiUrl = raw.apiUrl || window.LUPP_API_URL || "";
  let luppBaseUrl = (raw.luppUrl || getUrlOrigin(script.src || window.location.href)).replace(/\/$/, "");
  const requireActiveWidgetFromAttr = raw.requireActive === "true";
  let externalStoreId = raw.externalStoreId;
  const storeDomain = normalizedHostname(raw.storeDomain || window.location.hostname || "");

  if (!externalStoreId) externalStoreId = inferNuvemshopStoreId();
  if (!externalStoreId) externalStoreId = inferShopifyStoreId();

  // A weaker (external-id-only) identity requires the widget to be active —
  // it's not trustworthy enough on its own to render a possibly-stale embed.
  const requireActiveWidget = requireActiveWidgetFromAttr || (!storeSlug && Boolean(externalStoreId));

  if (
    /apps-scripts\.tiendanube\.com/i.test(getUrlHostname(script.src || window.location.href)) &&
    !/^https?:\/\/(www\.)?(luup\.dzns\.com\.br|playluup\.com\.br|lupp-lupp\.vercel\.app)/i.test(luppBaseUrl)
  ) {
    luppBaseUrl = "https://luup.dzns.com.br";
  }

  // The API host is distinct from data-lupp-url (the SPA host): explicit
  // attribute wins, localhost dev talks to the local API, production falls
  // back to the PROD constant.
  if (!apiUrl) {
    apiUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(luppBaseUrl)
      ? "http://localhost:3333"
      : PROD_API_URL;
  }
  apiUrl = apiUrl.replace(/\/$/, "");

  const launcherConfig: LauncherConfig = buildLauncherConfig(raw);
  const displayConfig = buildDisplayConfig(raw);
  const carouselConfig = buildCarouselConfig(raw);
  const loadStrategy = raw.loadStrategy;
  const previewMode = raw.previewMode;

  const canUseBootstrap = canRequestBootstrap({ widgetType, externalStoreId, storeDomain, storeSlug });

  debugLog("config", {
    canUseBootstrap,
    externalStoreId,
    luppBaseUrl,
    requireActiveWidget,
    storeDomain,
    storeId,
    storeSlug,
    apiUrl,
    widgetType,
  });

  if ((!storeId && !storeSlug && !externalStoreId && !storeDomain) || !canUseBootstrap) {
    debugLog("abort: initial gate", {
      hasStoreIdentity: Boolean(storeId || storeSlug || externalStoreId || storeDomain),
      keylessBootstrapAllowed: canUseBootstrap,
    });
    emitWidgetAborted("initial_gate");
    console.warn("[Luup] Configure data-store-id, data-store ou data-store-domain para carregar o widget.");
    return;
  }

  // -------------------------------------------------------------------------
  // Platform adapter bridge. The platform-specific code (Upzero, Shopify,
  // Nuvemshop) ships in separately-built widget-{platform}.js files that are
  // lazily injected next to widget.js once the bootstrap payload identifies
  // the store platform (core/adapter-loader.ts). Core and adapters share
  // config, mutable state and helpers exclusively through this window bridge.
  // -------------------------------------------------------------------------

  const sharedState: BridgeState = {
    activeStore: null,
    upzeroConfig: {} as UpzeroConfig,
    pendingStorefrontCartRefresh: false,
    pendingStorefrontCartDetail: null,
    upzeroCustomerStatusCache: null,
    upzeroCustomerStatusLastRefreshAt: 0,
    reloadStorefrontOnCartUpdate: true,
    showFeedbackFormOnClose: true,
    feedOverlayBackdropColor: "#000000",
    feedOverlayBackdropOpacity: 76,
    feedCloseButtonColor: "#ffffff",
  };

  const widgetBridge: WidgetBridge = {
    adapters: {},
    config: {
      apiUrl,
      configuredProductId,
      configuredProductUrl,
      externalStoreId,
      luppBaseUrl,
      nubesdkFrameMode,
      storeDomain,
      storeId,
      storeSlug,
      upzeroProxyBase: apiUrl + "/api/widget/upzero-proxy",
      widgetType,
    },
    state: sharedState,
    utils: {
      asRecord,
      createAnchor,
      debugLog,
      emitCartEvent,
      escapeHtml,
      getUrlHostname,
      getUrlOrigin,
      getUrlPathname,
      normalizedHostname,
      readQueryValue,
      resolveUrl,
      sameStorefrontHostname,
    },
    isUpzeroStore,
    isNuvemshopStore: (store) => isNuvemshopStore(store, externalStoreId),
    isShopifyStore,
    isTrustedLuppFrameOrigin,
    postFrameResponse,
    updateUpzeroCartCounters,
    updateNuvemshopCartCounters,
    updateShopifyCartCounters,
    track,
  };
  window.__LUPP_WIDGET_BRIDGE__ = widgetBridge;

  // Populate the shared runtime context for the core/render/feed modules
  // (see context.ts). Function declarations are hoisted, so everything is in
  // place before any render or overlay code can execute.
  ctx.script = script;
  ctx.widgetType = widgetType;
  ctx.nubesdkFrameMode = nubesdkFrameMode;
  ctx.previewMode = previewMode;
  ctx.storeId = storeId;
  ctx.storeSlug = storeSlug;
  ctx.externalStoreId = externalStoreId;
  ctx.storeDomain = storeDomain;
  ctx.apiUrl = apiUrl;
  ctx.luppBaseUrl = luppBaseUrl;
  ctx.bootstrapBase = apiUrl + "/api/widget/bootstrap";
  ctx.eventsBase = apiUrl + "/api/widget/events";
  ctx.upzeroProxyBase = apiUrl + "/api/widget/upzero-proxy";
  ctx.requireActiveWidget = requireActiveWidget;
  ctx.configuredProductId = configuredProductId;
  ctx.configuredProductUrl = configuredProductUrl;
  ctx.loadStrategy = loadStrategy;
  ctx.launcherConfig = launcherConfig;
  ctx.displayConfig = displayConfig;
  ctx.carouselConfig = carouselConfig;
  ctx.sharedState = sharedState;
  ctx.track = track;
  ctx.currentProductUrl = currentProductUrl;
  ctx.detectCustomerStatus = detectCustomerStatus;
  ctx.repairUpzeroProductUrl = repairUpzeroProductUrl;
  ctx.flushPendingStorefrontCartRefresh = flushPendingStorefrontCartRefresh;
  ctx.renderForCurrentUrl = renderForCurrentUrl;

  // Warm the feed origin's DNS/TLS as early as possible — well before the
  // launcher is even clicked — so opening the overlay later skips that cost.
  preconnectFeedOrigin(luppBaseUrl);

  // NubeSDK frame mode runs inside Nuvemshop's sandboxed iframe where cart
  // bridge messages can arrive before bootstrap resolves the platform, so
  // the nuvemshop adapter must be ready from the start.
  if (nubesdkFrameMode) {
    loadAdapter("nuvemshop").catch(() => {});
  }

  installTopLevelMessageHandlers();

  const root = createRoot();
  watchUrlChanges(root);
  watchUpzeroCustomerState(root);
  watchCarouselViewportBreakpoint(root);

  function startWidget(): void {
    // Single round trip: context mode returns the store, the fully evaluated
    // display/config block and the page's filtered, ordered video list in
    // one payload.
    //
    // watchUrlChanges is already listening at this point (registered before
    // runAfterPageReady even schedules startWidget), so an SPA navigation can
    // fire refreshContextForUrl while this very first fetch is still in
    // flight. Sharing its lastRequestedContextUrl guard means whichever
    // response is stale from a navigation that happened meanwhile is dropped
    // instead of unconditionally overwriting whatever the newer request
    // already rendered.
    const requestedUrl = window.location.href;
    ctx.lastRequestedContextUrl = requestedUrl;
    fetchBootstrap()
      .then((payload) => {
        if (ctx.lastRequestedContextUrl !== requestedUrl) return;
        const store: StorePayload =
          payload.store || {
            id: null,
            slug: storeSlug || externalStoreId,
            button_color: launcherConfig.accentColor,
          };
        if (!payload.active && requireActiveWidget) {
          debugLog("abort: bootstrap inactive with require-active", { error: payload.error || null });
          emitWidgetAborted("bootstrap_inactive", { error: payload.error || null });
          root.remove();
          return;
        }

        if (payload.upzero_config && typeof payload.upzero_config === "object") {
          sharedState.upzeroConfig = payload.upzero_config;
          store.upzero_config = payload.upzero_config;
          if (payload.upzero_config.storefront_url && !store.url) {
            store.url = String(payload.upzero_config.storefront_url);
          }
        }
        if (payload.feed_options && typeof payload.feed_options === "object") {
          if (typeof payload.feed_options.reload_storefront_on_cart_update === "boolean") {
            sharedState.reloadStorefrontOnCartUpdate = payload.feed_options.reload_storefront_on_cart_update;
          }
          if (typeof payload.feed_options.show_feedback_form_on_close === "boolean") {
            sharedState.showFeedbackFormOnClose = payload.feed_options.show_feedback_form_on_close;
          }
          if (typeof payload.feed_options.overlay_backdrop_color === "string") {
            sharedState.feedOverlayBackdropColor = payload.feed_options.overlay_backdrop_color;
          }
          if (typeof payload.feed_options.overlay_backdrop_opacity === "number") {
            sharedState.feedOverlayBackdropOpacity = payload.feed_options.overlay_backdrop_opacity;
          }
          if (typeof payload.feed_options.close_button_color === "string") {
            sharedState.feedCloseButtonColor = payload.feed_options.close_button_color;
          }
        }
        applyContextConfig(payload.config);
        ctx.contextDisplay = payload.display || {};
        const display = ctx.contextDisplay;
        if (display.show === false) {
          debugLog("abort: server display rules", { reason: display.reason || null });
          emitWidgetAborted(display.reason || "display_rules", { reason: display.reason || null });
          root.remove();
          return;
        }

        track(store.id, "widget_view", null, null, { bootstrap_mode: "context" });
        sharedState.activeStore = store;
        ctx.activeVideos = payload.videos || [];
        ctx.hasLoadedVideoList = true;
        const adapterPlatform = resolveAdapterPlatform(payload, externalStoreId);
        if (adapterPlatform) {
          loadAdapter(adapterPlatform).catch(() => {});
        }
        renderForCurrentUrl(root);
      })
      .catch((error) => {
        if (ctx.lastRequestedContextUrl !== requestedUrl) return;
        debugLog("abort: bootstrap error", error.message);
        emitWidgetAborted("bootstrap_error", { message: error.message });
        console.warn("[Luup]", error.message);
        root.remove();
      });
  }

  runAfterPageReady(loadStrategy, startWidget);
})();
