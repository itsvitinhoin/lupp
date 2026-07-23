// Lupp widget – core entry. Bundled by build-widget.mjs (esbuild, IIFE) into
// public/widget.js, the embed loaded on merchants' storefronts and injected
// into the dashboard by DashboardVideoWidget. Platform-specific code lives in
// ./platforms/*.js, built into separate widget-{platform}.js bundles that the
// core lazily injects after bootstrap (see loadAdapter / the widget bridge).
import {
  asRecord,
  createAnchor,
  debugLog,
  emitCartEvent,
  emitWidgetAborted,
  emitWidgetRendered,
  escapeHtml,
  getUrlHostname,
  getUrlOrigin,
  getUrlPathname,
  normalizedHostname,
  normalizeText,
  readQueryValue,
  resolveUrl,
  sameStorefrontHostname,
} from "./utils";
import { primeInlineVideos } from "./hls";
import { ctx, isUpzeroStore } from "./context";
import {
  isTrustedLuppFrameOrigin,
  openFeedOverlay,
  postFrameResponse,
  postUpzeroCustomerStatus,
  preconnectFeedOrigin,
} from "./overlay";
import { renderLauncher } from "./render/launcher";
import {
  removeHomeCarouselRoot,
  renderCarousel,
  renderEmbeddedHomeCarousel,
} from "./render/carousel";
import type {
  AdapterPlatform,
  BootstrapPayload,
  BridgeState,
  CarouselConfig,
  CarouselServerConfig,
  CartUpdateDetail,
  ContextConfig,
  CustomerStatus,
  DisplayConfig,
  DisplayServerConfig,
  LauncherConfig,
  LauncherServerConfig,
  NuvemshopAdapter,
  ShopifyAdapter,
  SlimProduct,
  SlimVideo,
  StorePayload,
  UpzeroAdapter,
  UpzeroConfig,
  WidgetBridge,
} from "./types";

type AnyAdapter = UpzeroAdapter | NuvemshopAdapter | ShopifyAdapter;

(function () {
  "use strict";

  var scriptElement = document.currentScript as HTMLScriptElement | null;
  if (!scriptElement) return;
  var script: HTMLScriptElement = scriptElement;

  // Lupp REST API host used when data-api-url is absent on a non-localhost
  // page. CONFIRM this hostname before deploying the widget.
  var PROD_API_URL = "https://luup.dzns.net";

  var scriptParams = {
    get: function (name: string): string | null {
      return readQueryValue(script.src || "", name);
    },
  };

  // No ES2015+ polyfills: the gate below already excludes any browser old
  // enough to lack Array.find / Number.isFinite / Math.trunc / closest.
  if (!window.Promise || !window.fetch) {
    if (window.console && console.warn) {
      console.warn("[Luup] Este navegador não possui recursos mínimos para carregar o widget.");
    }
    return;
  }

  interface ScriptValueSpec {
    attr: string;
    query: string[];
    def: string;
  }

  // Embed configuration surface: data-* attribute, script-src query aliases
  // and default value, resolved in one pass below. Attribute/query names and
  // defaults are public embed contract — never rename them.
  var SCRIPT_VALUE_SPECS = {
    storeId: { attr: "data-store-id", query: ["lupp_store_id", "store_id"], def: "" },
    storeSlug: { attr: "data-store", query: ["lupp_store", "lupp_store_slug", "store_slug"], def: "" },
    widgetType: { attr: "data-widget", query: ["lupp_widget", "widget"], def: "floating_launcher" },
    nubesdkFrameMode: { attr: "data-nubesdk-frame", query: ["lupp_nubesdk_frame"], def: "" },
    productUrl: { attr: "data-product-url", query: ["lupp_product_url", "product_url"], def: "" },
    productId: { attr: "data-product-id", query: ["lupp_product_id", "product_id", "external_product_id", "lupp_external_product_id"], def: "" },
    apiUrl: { attr: "data-api-url", query: ["lupp_api_url", "api_url"], def: "" },
    luppUrl: { attr: "data-lupp-url", query: ["lupp_url", "lupp_base_url"], def: "" },
    requireActive: { attr: "data-require-active", query: ["lupp_require_active", "require_active"], def: "false" },
    externalStoreId: { attr: "data-external-store-id", query: ["external_store_id", "lupp_external_store_id", "nuvemshop_store_id", "store"], def: "" },
    storeDomain: { attr: "data-store-domain", query: ["store_domain", "lupp_store_domain", "domain", "hostname"], def: "" },
    position: { attr: "data-position", query: ["lupp_position"], def: "bottom-left" },
    accentColor: { attr: "data-accent-color", query: ["lupp_accent_color"], def: "#fe2c55" },
    backgroundColor: { attr: "data-background-color", query: ["lupp_background_color"], def: "#0b0b0f" },
    textColor: { attr: "data-text-color", query: ["lupp_text_color"], def: "#ffffff" },
    label: { attr: "data-label", query: ["lupp_label"], def: "Compre pelo vídeo" },
    fontFamily: { attr: "data-font-family", query: ["lupp_font_family"], def: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
    bubbleSize: { attr: "data-bubble-size", query: ["lupp_bubble_size"], def: "74" },
    model: { attr: "data-model", query: ["lupp_model"], def: "circular" },
    offsetX: { attr: "data-offset-x", query: ["lupp_offset_x"], def: "18" },
    offsetY: { attr: "data-offset-y", query: ["lupp_offset_y"], def: "18" },
    hideWithoutVideos: { attr: "data-hide-without-videos", query: ["lupp_hide_without_videos"], def: "false" },
    homeExperienceEnabled: { attr: "data-home-experience-enabled", query: ["lupp_home_experience_enabled"], def: "true" },
    carouselTitle: { attr: "data-carousel-title", query: ["lupp_carousel_title"], def: "Descubra cada detalhe e Compre" },
    carouselDescription: { attr: "data-carousel-description", query: ["lupp_carousel_description"], def: "" },
    homeCarouselEnabled: { attr: "data-home-carousel-enabled", query: ["lupp_home_carousel_enabled"], def: "true" },
    carouselBeforeHeading: { attr: "data-carousel-before-heading", query: ["lupp_carousel_before_heading"], def: "Com Capa" },
    carouselAnchorSelector: { attr: "data-carousel-anchor-selector", query: ["lupp_carousel_anchor_selector"], def: "" },
    carouselAnchorPlacement: { attr: "data-carousel-anchor-placement", query: ["lupp_carousel_anchor_placement"], def: "before" },
    carouselAnchorFallback: { attr: "data-carousel-anchor-fallback", query: ["lupp_carousel_anchor_fallback"], def: "bottom" },
    carouselMaxItems: { attr: "data-carousel-max-items", query: ["lupp_carousel_max_items"], def: "12" },
    carouselMobileMaxItems: { attr: "data-carousel-mobile-max-items", query: ["lupp_carousel_mobile_max_items"], def: "6" },
    carouselShowPrice: { attr: "data-carousel-show-price", query: ["lupp_carousel_show_price"], def: "true" },
    carouselShowCartActions: { attr: "data-carousel-show-cart-actions", query: ["lupp_carousel_show_cart_actions"], def: "true" },
    loadStrategy: { attr: "data-load-strategy", query: ["lupp_load_strategy"], def: "idle" },
    previewMode: { attr: "data-preview-mode", query: ["lupp_preview_mode"], def: "balanced" },
  } satisfies Record<string, ScriptValueSpec>;

  function readScriptValue(spec: ScriptValueSpec): string {
    var attributeValue = script.getAttribute(spec.attr);
    if (attributeValue !== null && attributeValue !== "") return attributeValue;
    for (var index = 0; index < spec.query.length; index += 1) {
      var queryValue = scriptParams.get(spec.query[index]);
      if (queryValue !== null && queryValue !== "") return queryValue;
    }
    return spec.def;
  }

  // True when the embed set this value explicitly on the script tag (data-*
  // attribute or script-src query param). Explicit embed values outrank the
  // dashboard-configured settings echoed back by the server.
  function hasExplicitScriptValue(spec: ScriptValueSpec): boolean {
    var attributeValue = script.getAttribute(spec.attr);
    if (attributeValue !== null && attributeValue !== "") return true;
    for (var index = 0; index < spec.query.length; index += 1) {
      var queryValue = scriptParams.get(spec.query[index]);
      if (queryValue !== null && queryValue !== "") return true;
    }
    return false;
  }

  // One pass over the table resolves every raw (string) embed value.
  var rawScript = {} as Record<keyof typeof SCRIPT_VALUE_SPECS, string>;
  (Object.keys(SCRIPT_VALUE_SPECS) as (keyof typeof SCRIPT_VALUE_SPECS)[]).forEach(
    function (key) {
      rawScript[key] = readScriptValue(SCRIPT_VALUE_SPECS[key]);
    },
  );

  var storeId = rawScript.storeId;
  var storeSlug = rawScript.storeSlug;
  var widgetType = rawScript.widgetType.replace(/-/g, "_");
  var nubesdkFrameMode = rawScript.nubesdkFrameMode;
  var configuredProductUrl = rawScript.productUrl;
  var configuredProductId = rawScript.productId;
  var apiUrl = rawScript.apiUrl || window.LUPP_API_URL || "";
  var luppBaseUrl = (
    rawScript.luppUrl || getUrlOrigin(script.src || window.location.href)
  ).replace(/\/$/, "");
  var requireActiveWidget = rawScript.requireActive === "true";
  var externalStoreId = rawScript.externalStoreId;
  var storeDomain = normalizedHostname(
    rawScript.storeDomain || window.location.hostname || "",
  );
  var upzeroConfig: UpzeroConfig = {};

  function inferNuvemshopStoreId(): string {
    try {
      if (
        window.LS &&
        window.LS.store &&
        window.LS.store.id !== undefined &&
        window.LS.store.id !== null
      ) {
        return String(window.LS.store.id);
      }
      if (
        window.LS &&
        window.LS.store_id !== undefined &&
        window.LS.store_id !== null
      ) {
        return String(window.LS.store_id);
      }
      if (
        window.Tiendanube &&
        window.Tiendanube.storeId !== undefined &&
        window.Tiendanube.storeId !== null
      ) {
        return String(window.Tiendanube.storeId);
      }
      var hostMatch = window.location.hostname.match(
        /^(\d+)\.lojavirtualnuvem\.com\.br$/i,
      );
      if (hostMatch) return hostMatch[1];
    } catch (_) {}
    return "";
  }

  function inferShopifyStoreId(): string {
    try {
      if (
        window.Shopify &&
        window.Shopify.shop &&
        /\.myshopify\.com$/i.test(String(window.Shopify.shop))
      ) {
        return String(window.Shopify.shop).toLowerCase();
      }
      if (
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.shop &&
        /\.myshopify\.com$/i.test(String(window.ShopifyAnalytics.meta.shop))
      ) {
        return String(window.ShopifyAnalytics.meta.shop).toLowerCase();
      }
    } catch (_) {}
    return "";
  }

  if (!externalStoreId) {
    externalStoreId = inferNuvemshopStoreId();
  }

  if (!externalStoreId) {
    externalStoreId = inferShopifyStoreId();
  }

  if (!storeSlug && externalStoreId) {
    requireActiveWidget = true;
  }

  if (
    /apps-scripts\.tiendanube\.com/i.test(
      getUrlHostname(script.src || window.location.href),
    ) &&
    !/^https?:\/\/(www\.)?(luup\.dzns\.com\.br|playluup\.com\.br|lupp-lupp\.vercel\.app)/i.test(
      luppBaseUrl,
    )
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

  var launcherConfig: LauncherConfig = {
    position: rawScript.position,
    accentColor: rawScript.accentColor,
    backgroundColor: rawScript.backgroundColor,
    textColor: rawScript.textColor,
    label: rawScript.label,
    fontFamily: rawScript.fontFamily,
    bubbleSize: Number(rawScript.bubbleSize),
    model: rawScript.model,
    offsetX: Number(rawScript.offsetX),
    offsetY: Number(rawScript.offsetY),
  };

  // Path/product display rules are evaluated server-side in context mode;
  // only the flags the client still acts on locally remain here.
  var displayConfig: DisplayConfig = {
    hideWithoutVideos: rawScript.hideWithoutVideos === "true",
    homeExperienceEnabled: rawScript.homeExperienceEnabled !== "false",
  };
  var carouselConfig: CarouselConfig = {
    title: rawScript.carouselTitle,
    description: rawScript.carouselDescription,
    enabled: rawScript.homeCarouselEnabled !== "false",
    beforeHeading: rawScript.carouselBeforeHeading,
    anchorSelector: rawScript.carouselAnchorSelector,
    anchorPlacement: rawScript.carouselAnchorPlacement,
    anchorFallback: rawScript.carouselAnchorFallback,
    maxItems: Number(rawScript.carouselMaxItems) || 12,
    mobileMaxItems: Number(rawScript.carouselMobileMaxItems) || 6,
    showPrice: rawScript.carouselShowPrice !== "false",
    showCartActions: rawScript.carouselShowCartActions !== "false",
  };
  var loadStrategy = rawScript.loadStrategy;
  var previewMode = rawScript.previewMode;

  var canUseBootstrap =
    widgetType === "floating_launcher" ||
    widgetType === "floating_video" ||
    isCarouselWidget() ||
    Boolean(externalStoreId) ||
    Boolean(storeDomain) ||
    Boolean(storeSlug);

  debugLog("config", {
    canUseBootstrap: canUseBootstrap,
    externalStoreId: externalStoreId,
    luppBaseUrl: luppBaseUrl,
    requireActiveWidget: requireActiveWidget,
    storeDomain: storeDomain,
    storeId: storeId,
    storeSlug: storeSlug,
    apiUrl: apiUrl,
    widgetType: widgetType,
  });

  if (
    (!storeId && !storeSlug && !externalStoreId && !storeDomain) ||
    !canUseBootstrap
  ) {
    debugLog("abort: initial gate", {
      hasStoreIdentity: Boolean(
        storeId || storeSlug || externalStoreId || storeDomain,
      ),
      keylessBootstrapAllowed: canUseBootstrap,
    });
    emitWidgetAborted("initial_gate");
    console.warn(
      "[Luup] Configure data-store-id, data-store ou data-store-domain para carregar o widget.",
    );
    return;
  }

  var bootstrapBase = apiUrl + "/api/widget/bootstrap";
  var eventsBase = apiUrl + "/api/widget/events";
  var upzeroProxyBase = apiUrl + "/api/widget/upzero-proxy";

  // Visitor/session ids share one storage-backed generator (localStorage
  // persists across visits, sessionStorage is per tab session).
  function ensureStoredId(storage: Storage, key: string): string {
    var current = storage.getItem(key);
    if (current) return current;
    var id = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    storage.setItem(key, id);
    return id;
  }

  function ensureVisitorId(): string {
    return ensureStoredId(localStorage, "lupp_visitor_id");
  }

  function ensureSessionId(): string {
    return ensureStoredId(sessionStorage, "lupp_session_id");
  }

  // Context-mode bootstrap: the request carries the page URL (plus product
  // hints) and the server answers with pre-filtered, pre-ordered videos,
  // pre-formatted product fields and a fully evaluated display/config block,
  // so the browser no longer filters, merges or formats anything. Responses
  // carry ETag + Cache-Control (60s), keyed per URL.
  // Sandboxed pages (about:srcdoc / blob: iframes such as the dashboard
  // simulator) expose no usable origin; data-product-url then drives the page
  // context, with the Lupp app origin as the last-resort parseable URL.
  function hasUsablePageOrigin(): boolean {
    try {
      var origin = window.location.origin;
      if (!origin || origin === "null") return false;
      return !/^(about|blob):/i.test(String(window.location.protocol || ""));
    } catch (_) {
      return false;
    }
  }

  function contextUrl(): string {
    var raw;
    if (nubesdkFrameMode && configuredProductUrl) {
      raw = configuredProductUrl;
    } else if (hasUsablePageOrigin()) {
      raw = window.location.href;
    } else if (configuredProductUrl) {
      raw = configuredProductUrl;
    } else {
      return getUrlOrigin(luppBaseUrl) + "/";
    }
    var resolved = resolveUrl(raw, window.location.href);
    // origin + pathname only (no query/hash) to keep cache keys tight.
    return (
      getUrlOrigin(resolved) + getUrlPathname(resolved, window.location.href)
    );
  }

  function fetchBootstrap(): Promise<BootstrapPayload> {
    var params = new URLSearchParams();
    var externalProvider =
      /\.myshopify\.com$/i.test(String(externalStoreId || ""))
        ? "shopify"
        : "nuvemshop";
    params.set("widget", mappedWidgetType());
    params.set("url", contextUrl());
    if (configuredProductUrl) {
      params.set("product_url", configuredProductUrl);
    }
    var externalProductId = currentExternalProductId();
    if (externalProductId) {
      params.set("external_product_id", externalProductId);
    }
    if (storeId) {
      // A Lupp store id is authoritative: it alone resolves the store, so
      // the weaker identifiers (slug / external id / domain) stay home and
      // the server takes its fastest resolution path.
      params.set("store_id", storeId);
    } else {
      if (storeSlug) params.set("store_slug", storeSlug);
      if (externalStoreId) {
        params.set("provider", externalProvider);
        params.set("external_store_id", externalStoreId);
      } else if (storeDomain) {
        params.set("provider", externalProvider);
        params.set("store_domain", storeDomain);
      }
    }

    var bootstrapUrl = bootstrapBase + "?" + params.toString();
    debugLog("bootstrap request", bootstrapUrl);
    return fetch(bootstrapUrl).then(function (response) {
      if (!response.ok) {
        debugLog("bootstrap failed", { status: response.status });
        throw new Error("Luup bootstrap error: " + response.status);
      }
      return response.json().then(function (payload) {
        debugLog("bootstrap payload", {
          active: payload && payload.active,
          error: (payload && payload.error) || null,
          mode: (payload && payload.mode) || null,
          show:
            payload && payload.display ? payload.display.show !== false : null,
          reason:
            (payload && payload.display && payload.display.reason) || null,
          resolvedBy: (payload && payload.resolved_by) || null,
          videoCount:
            payload && payload.videos && payload.videos.length
              ? payload.videos.length
              : 0,
        });
        return payload;
      });
    });
  }

  function shouldUseBootstrap(): boolean {
    return canUseBootstrap;
  }

  function runAfterPageReady(callback: () => void): void {
    var hasRun = false;
    function run() {
      if (hasRun) return;
      hasRun = true;
      callback();
    }

    if (loadStrategy === "immediate") {
      run();
      return;
    }

    var delay = loadStrategy === "delayed" ? 2200 : 0;
    function scheduleIdle() {
      window.setTimeout(function () {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(run, { timeout: 3000 });
          return;
        }
        setTimeout(run, 1);
      }, delay);
    }

    if (document.readyState === "complete") {
      scheduleIdle();
      return;
    }

    window.addEventListener("load", scheduleIdle, { once: true });
  }

  // -------------------------------------------------------------------------
  // Platform adapter bridge. The platform-specific code (Upzero, Shopify,
  // Nuvemshop) ships in separately-built widget-{platform}.js files that are
  // lazily injected next to widget.js once the bootstrap payload identifies
  // the store platform. Core and adapters share config, mutable state and
  // helpers exclusively through this window bridge.
  // -------------------------------------------------------------------------

  var sharedState: BridgeState = {
    activeStore: null,
    upzeroConfig: upzeroConfig,
    pendingStorefrontCartRefresh: false,
    pendingStorefrontCartDetail: null,
    upzeroCustomerStatusCache: null,
    upzeroCustomerStatusLastRefreshAt: 0,
  };

  var widgetBridge: WidgetBridge = {
    adapters: {},
    config: {
      apiUrl: apiUrl,
      configuredProductId: configuredProductId,
      configuredProductUrl: configuredProductUrl,
      externalStoreId: externalStoreId,
      luppBaseUrl: luppBaseUrl,
      nubesdkFrameMode: nubesdkFrameMode,
      storeDomain: storeDomain,
      storeId: storeId,
      storeSlug: storeSlug,
      upzeroProxyBase: upzeroProxyBase,
      widgetType: widgetType,
    },
    state: sharedState,
    utils: {
      asRecord: asRecord,
      createAnchor: createAnchor,
      debugLog: debugLog,
      emitCartEvent: emitCartEvent,
      escapeHtml: escapeHtml,
      getUrlHostname: getUrlHostname,
      getUrlOrigin: getUrlOrigin,
      getUrlPathname: getUrlPathname,
      normalizedHostname: normalizedHostname,
      readQueryValue: readQueryValue,
      resolveUrl: resolveUrl,
      sameStorefrontHostname: sameStorefrontHostname,
    },
    isUpzeroStore: isUpzeroStore,
    isNuvemshopStore: isNuvemshopStore,
    isShopifyStore: isShopifyStore,
    isTrustedLuppFrameOrigin: isTrustedLuppFrameOrigin,
    postFrameResponse: postFrameResponse,
    updateUpzeroCartCounters: updateUpzeroCartCounters,
    updateNuvemshopCartCounters: updateNuvemshopCartCounters,
    updateShopifyCartCounters: updateShopifyCartCounters,
    track: track,
  };
  window.__LUPP_WIDGET_BRIDGE__ = widgetBridge;

  // Populate the shared runtime context for the render/overlay modules
  // (see context.ts). Function declarations are hoisted, so everything
  // is in place before any render or overlay code can execute.
  ctx.script = script;
  ctx.widgetType = widgetType;
  ctx.nubesdkFrameMode = nubesdkFrameMode;
  ctx.previewMode = previewMode;
  ctx.storeId = storeId;
  ctx.storeSlug = storeSlug;
  ctx.externalStoreId = externalStoreId;
  ctx.luppBaseUrl = luppBaseUrl;
  ctx.launcherConfig = launcherConfig;
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

  // Adapters are served from the same directory as widget.js itself.
  var adapterScriptBase = resolveUrl(
    script.src || "widget.js",
    window.location.href,
  ).replace(/[^/]*(?:[?#].*)?$/, "");

  var adapterLoadPromises: Partial<
    Record<AdapterPlatform, Promise<AnyAdapter>>
  > = {};

  function loadAdapter(platform: AdapterPlatform): Promise<AnyAdapter> {
    if (!platform) {
      return Promise.reject(new Error("lupp_adapter_platform_missing"));
    }
    var pending = adapterLoadPromises[platform];
    if (pending) return pending;
    var loadPromise = new Promise<AnyAdapter>(function (resolve, reject) {
      var registered = widgetBridge.adapters[platform];
      if (registered) {
        resolve(registered);
        return;
      }
      var adapterScript = document.createElement("script");
      adapterScript.async = true;
      adapterScript.src = adapterScriptBase + "widget-" + platform + ".js";
      adapterScript.onload = function () {
        var adapter = widgetBridge.adapters[platform];
        if (adapter) {
          resolve(adapter);
        } else {
          reject(new Error("lupp_adapter_register_failed"));
        }
      };
      adapterScript.onerror = function () {
        reject(new Error("lupp_adapter_load_failed"));
      };
      (document.head || document.body || document.documentElement).appendChild(
        adapterScript,
      );
    });
    adapterLoadPromises[platform] = loadPromise;
    return loadPromise;
  }

  function resolveAdapterPlatform(payload: BootstrapPayload): AdapterPlatform | "" {
    var platform = String(
      (payload && payload.store && payload.store.platform) || "",
    ).toLowerCase();
    if (
      platform === "upzero" ||
      platform === "shopify" ||
      platform === "nuvemshop"
    ) {
      return platform;
    }
    if (
      /\.myshopify\.com$/i.test(String(externalStoreId || "")) ||
      window.Shopify
    ) {
      return "shopify";
    }
    if (window.LS || window.Tiendanube) return "nuvemshop";
    return "";
  }

  // Core-side customer status resolver: non-Upzero stores keep the historical
  // fast path; Upzero stores delegate to the lazily loaded upzero adapter.
  function detectCustomerStatus(
    store: StorePayload | null,
    options?: { forceRefresh?: boolean },
  ): Promise<CustomerStatus> {
    if (!isUpzeroStore(store)) {
      return Promise.resolve({
        approved: true,
        loggedIn: true,
        source: "not_upzero",
        status: "not_applicable",
      });
    }
    return loadAdapter("upzero")
      .then(function (adapter) {
        return (adapter as UpzeroAdapter).detectUpzeroCustomerStatus(
          store,
          options,
        );
      })
      .catch(function () {
        // Mirrors detectUpzeroCustomerStatus's final fallback when every
        // detection strategy fails (here: the adapter itself did not load).
        return {
          approved: false,
          loggedIn: false,
          source: "fallback",
          status: "UNKNOWN",
        };
      });
  }

  // NubeSDK frame mode runs inside Nuvemshop's sandboxed iframe where cart
  // bridge messages can arrive before bootstrap resolves the platform, so
  // the nuvemshop adapter must be ready from the start.
  if (nubesdkFrameMode) {
    loadAdapter("nuvemshop").catch(function () {});
  }

  function formatUpzeroCartCount(quantity: number): string {
    return quantity === 1 ? "1 PC." : quantity + " PCS.";
  }

  function updateUpzeroCartCounters(quantity: number): void {
    if (!document.body || !Number.isFinite(quantity)) return;

    var label = formatUpzeroCartCount(Math.max(0, Math.trunc(quantity)));
    var selector =
      '[data-cart-count],[data-cart-quantity],[data-testid*="cart" i],' +
      '[class*="cart-count" i],[class*="cart-quantity" i],' +
      '[class*="cart-badge" i],[aria-label*="carrinho" i]';

    try {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (element) {
        if (!element) return;
        if (element.hasAttribute("data-cart-count")) {
          element.setAttribute("data-cart-count", String(quantity));
        }
        if (element.hasAttribute("data-cart-quantity")) {
          element.setAttribute("data-cart-quantity", String(quantity));
        }
        if (/^\s*\d+\s*$/.test(element.textContent || "")) {
          element.textContent = String(quantity);
        }
      });
    } catch (_) {}

    try {
      var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            var text = node && node.nodeValue ? node.nodeValue : "";
            return /^\s*\d+\s*(?:pc|pcs|pç|pçs|peça|peças)\.?\s*$/i.test(
              text,
            )
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        },
      );
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        node.nodeValue = label;
      });
    } catch (_) {}
  }

  function flushPendingStorefrontCartRefresh(): void {
    if (!sharedState.pendingStorefrontCartRefresh) return;
    var detail: Partial<CartUpdateDetail> =
      sharedState.pendingStorefrontCartDetail || {};
    sharedState.pendingStorefrontCartRefresh = false;
    sharedState.pendingStorefrontCartDetail = null;

    [
      "luup:cart-refresh",
      "luup:cart-updated",
      "upzero:cart:refresh",
      "upzero:cart:updated",
      "storefront:cart:refresh",
      "storefront:cart:updated",
      "cart:refresh",
      "cart:updated",
    ].forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    updateUpzeroCartCounters(Number(detail.quantity || 0));
    updateNuvemshopCartCounters(Number(detail.quantity || 0));
    updateShopifyCartCounters(Number(detail.quantity || 0));

    if (!isUpzeroStore(activeStore) && !isNuvemshopStore(activeStore) && !isShopifyStore(activeStore)) return;

    window.setTimeout(function () {
      try {
        if (window.next && window.next.router && window.next.router.reload) {
          window.next.router.reload();
          return;
        }
      } catch (_) {}

      try {
        window.location.reload();
      } catch (_) {
        window.location.href = window.location.href;
      }
    }, 180);
  }

  function isNuvemshopStore(store: StorePayload | null | undefined): boolean {
    var platform = String((store && store.platform) || "").toLowerCase();
    return (
      platform === "nuvemshop" ||
      (!platform &&
        Boolean(externalStoreId) &&
        !/\.myshopify\.com$/i.test(String(externalStoreId || "")))
    );
  }

  function isShopifyStore(store: StorePayload | null | undefined): boolean {
    return String((store && store.platform) || "").toLowerCase() === "shopify";
  }

  function updateNuvemshopCartCounters(quantity: number): void {
    if (!quantity || quantity <= 0 || typeof document === "undefined") return;
    try {
      var counters = document.querySelectorAll(
        ".js-cart-widget-amount, [data-component='cart-button'] .badge"
      );
      Array.prototype.forEach.call(counters, function (counter) {
        var current = parseInt(String(counter.textContent || "0").replace(/[^\d]/g, ""), 10);
        if (!Number.isFinite(current) || current < 0) current = 0;
        if (current === 0) {
          counter.textContent = String(quantity);
        }
        counter.classList.remove("d-none", "d-md-inline-block");
        counter.removeAttribute("hidden");
      });
    } catch (_) {}
  }

  function updateShopifyCartCounters(quantity: number): void {
    if (!quantity || quantity <= 0 || typeof document === "undefined") return;
    try {
      var counters = document.querySelectorAll(
        "[data-cart-count], .cart-count, .cart-item-count, .cart-count-bubble span, .header__icon--cart .badge"
      );
      Array.prototype.forEach.call(counters, function (counter) {
        var current = parseInt(String(counter.textContent || "0").replace(/[^\d]/g, ""), 10);
        if (!Number.isFinite(current) || current < 0) current = 0;
        counter.textContent = String(current + quantity);
        counter.classList.remove("hidden", "d-none", "visually-hidden");
        counter.removeAttribute("hidden");
        counter.setAttribute("aria-hidden", "false");
      });
    } catch (_) {}
  }

  window.addEventListener("message", function (event: MessageEvent) {
    var data = (event.data || {}) as Record<string, unknown>;
    if (
      !data ||
      data.type !== "LUPP_UPZERO_CUSTOMER_STATUS_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    detectCustomerStatus(activeStore, { forceRefresh: true }).then(
      function (status: CustomerStatus) {
        postUpzeroCustomerStatus(event.source, event.origin, status);
      },
    );
  });

  window.addEventListener("message", function (event: MessageEvent) {
    var data = (event.data || {}) as Record<string, unknown>;
    if (
      !data ||
      data.type !== "LUPP_OPEN_PRODUCT_PAGE_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    var url = String(data.url || "");
    if (!url) return;
    try {
      window.location.href = resolveUrl(url, window.location.href);
    } catch (_) {
      window.location.href = url;
    }
  });

  function normalizePath(value: unknown): string {
    var path = String(value || "/").trim();
    try {
      path = getUrlPathname(path, window.location.origin);
    } catch (_) {}
    path = path.replace(/\/+/g, "/");
    if (path.length > 1) path = path.replace(/\/$/, "");
    return path || "/";
  }

  function currentProductUrl() {
    return configuredProductUrl || window.location.href;
  }

  function extractProductHandle(value: unknown): string {
    var path = normalizePath(value);
    var match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : "";
  }

  function slugifyForPath(value: unknown): string {
    var text = String(value || "")
      .trim()
      .toLowerCase();
    try {
      text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (_) {}
    return text
      .replace(/&/g, " e ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function upzeroReferenceSlugFromProduct(
    product: Record<string, unknown> | null,
    fallbackUrl?: unknown,
  ): string {
    var candidates = [
      fallbackUrl,
      product && product.product_url,
      product && product.name,
      product && product.title,
      product && product.sku,
      product && product.code,
      product && product.external_id,
    ];
    var numericFallback = "";

    for (var index = 0; index < candidates.length; index += 1) {
      var value = String(candidates[index] || "");
      if (!value) continue;
      var decoded = value;
      try {
        decoded = decodeURIComponent(value);
      } catch (_) {}
      var refMatch = decoded.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9]*)/i);
      if (refMatch && refMatch[1]) {
        return "ref" + refMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
      }
      var compactRefMatch = decoded.match(/\bref(\d+[a-z0-9]*)/i);
      if (compactRefMatch && compactRefMatch[1]) {
        return "ref" + compactRefMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
      }
      var numeric = decoded.match(/^\s*(\d+[a-z0-9-]*)\s*$/i);
      if (numeric && numeric[1] && !numericFallback) {
        numericFallback =
          "ref" + numeric[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
      }
    }

    return numericFallback;
  }

  function upzeroProductHandleFromProduct(
    product: Record<string, unknown> | null,
    fallbackUrl?: unknown,
  ): string {
    var referenceSlug = upzeroReferenceSlugFromProduct(product, fallbackUrl);
    var savedHandle = extractProductHandle(fallbackUrl || (product && product.product_url));
    if (savedHandle) {
      try {
        savedHandle = decodeURIComponent(savedHandle);
      } catch (_) {}
      savedHandle = savedHandle
        .replace(/^\s*ref\s*[:#-]?\s*(\d+)/i, "ref$1")
        .replace(/^(\d+)/, "ref$1");
      var savedSlug = slugifyForPath(savedHandle);
      if (savedSlug) {
        if (referenceSlug && savedSlug.indexOf(referenceSlug) !== 0) {
          return referenceSlug + "-" + savedSlug.replace(/^ref\d+-?/, "");
        }
        return savedSlug;
      }
    }

    var nameSlug = slugifyForPath(
      firstTextValue([product && product.name, product && product.title], ""),
    );
    if (referenceSlug && nameSlug) {
      return referenceSlug + "-" + nameSlug.replace(/^ref\d+-?/, "");
    }
    return referenceSlug || nameSlug;
  }

  function repairUpzeroProductUrl(
    productInput: SlimProduct | Record<string, unknown> | null,
    fallbackUrl: string | undefined,
    store: StorePayload | null,
  ): string {
    var product = productInput as Record<string, unknown> | null;
    var url = String(
      fallbackUrl || (product && product.product_url) || "",
    );
    var base = String(
      (store && (store.url || store.store_url)) ||
        (upzeroConfig && upzeroConfig.storefront_url) ||
        (activeStore && activeStore.url) ||
        window.location.origin,
    );
    var handle = upzeroProductHandleFromProduct(product, url);
    if (!handle) return url;

    try {
      var parsed = new URL(url || base, base);
      var originalVariantMatch = parsed.pathname.match(/^\/produtos?\/[^/]+\/([^/?#]+)/i);
      var existingColorSlug =
        originalVariantMatch && originalVariantMatch[1]
          ? slugifyForPath(decodeURIComponent(originalVariantMatch[1]))
          : "";
      var productPath = parsed.pathname.match(/^\/produtos?\//i);
      parsed.pathname = (productPath ? "/produtos/" : "/produtos/") + handle;
      // Slim server products carry no variants, so only a colour slug
      // already present in the saved URL can be preserved.
      if (existingColorSlug) parsed.pathname += "/" + existingColorSlug;
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      var normalizedBase = String(base || "").replace(/\/$/, "");
      return normalizedBase + "/produtos/" + handle;
    }
  }

  function isHomeCarouselWidget(): boolean {
    return (
      widgetType === "home_carousel" ||
      widgetType === "horizontal_feed" ||
      widgetType === "home_video_carousel"
    );
  }

  function isCarouselWidget(): boolean {
    return (
      isHomeCarouselWidget() ||
      widgetType === "carousel" ||
      widgetType === "video_carousel"
    );
  }

  function mappedWidgetType(): string {
    if (widgetType === "floating_launcher" || isCarouselWidget()) {
      return "floating_video";
    }
    return widgetType;
  }

  // Adopts the server-evaluated widget config (context mode) wholesale, then
  // keeps any value the embed set explicitly on the script tag. Precedence:
  // explicit data-* attributes > dashboard settings > defaults. (Previously
  // dashboard settings silently overrode explicit attributes, which kept
  // test-store/simulator overrides from sticking.)
  function applyContextConfig(config: ContextConfig | undefined): void {
    var launcher: LauncherServerConfig = (config && config.launcher) || {};
    var display: DisplayServerConfig = (config && config.display) || {};
    var carousel: CarouselServerConfig = (config && config.carousel) || {};

    if (launcher.position && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.position)) {
      launcherConfig.position = launcher.position;
    }
    if (launcher.accent_color && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.accentColor)) {
      launcherConfig.accentColor = launcher.accent_color;
    }
    if (launcher.background_color && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.backgroundColor)) {
      launcherConfig.backgroundColor = launcher.background_color;
    }
    if (launcher.text_color && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.textColor)) {
      launcherConfig.textColor = launcher.text_color;
    }
    if (typeof launcher.label === "string" && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.label)) {
      launcherConfig.label = launcher.label;
    }
    if (launcher.font_family && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.fontFamily)) {
      launcherConfig.fontFamily = launcher.font_family;
    }
    if (launcher.bubble_size && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.bubbleSize)) {
      launcherConfig.bubbleSize =
        Number(launcher.bubble_size) || launcherConfig.bubbleSize;
    }
    if (launcher.model && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.model)) {
      launcherConfig.model = launcher.model;
    }
    if (launcher.offset_x && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.offsetX)) {
      launcherConfig.offsetX =
        Number(launcher.offset_x) || launcherConfig.offsetX;
    }
    if (launcher.offset_y && !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.offsetY)) {
      launcherConfig.offsetY =
        Number(launcher.offset_y) || launcherConfig.offsetY;
    }

    if (
      "hide_without_videos" in display &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.hideWithoutVideos)
    ) {
      displayConfig.hideWithoutVideos = display.hide_without_videos === true;
    }
    if (
      "home_experience_enabled" in display &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.homeExperienceEnabled)
    ) {
      displayConfig.homeExperienceEnabled =
        display.home_experience_enabled !== false;
    }

    if (
      "enabled" in carousel &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.homeCarouselEnabled)
    ) {
      carouselConfig.enabled = carousel.enabled !== false;
    }
    if (
      typeof carousel.title === "string" &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselTitle)
    ) {
      carouselConfig.title = carousel.title || carouselConfig.title;
    }
    if (
      typeof carousel.description === "string" &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselDescription)
    ) {
      carouselConfig.description = carousel.description;
    }
    if (
      typeof carousel.before_heading === "string" &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselBeforeHeading)
    ) {
      carouselConfig.beforeHeading =
        carousel.before_heading || carouselConfig.beforeHeading;
    }
    if (
      carousel.anchor_selector &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselAnchorSelector)
    ) {
      carouselConfig.anchorSelector = carousel.anchor_selector;
    }
    if (
      carousel.anchor_placement &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselAnchorPlacement)
    ) {
      carouselConfig.anchorPlacement = carousel.anchor_placement;
    }
    if (
      carousel.anchor_fallback &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselAnchorFallback)
    ) {
      carouselConfig.anchorFallback = carousel.anchor_fallback;
    }
    if (
      "max_items" in carousel &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselMaxItems)
    ) {
      carouselConfig.maxItems =
        Number(carousel.max_items) || carouselConfig.maxItems;
    }
    if (
      "mobile_max_items" in carousel &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselMobileMaxItems)
    ) {
      carouselConfig.mobileMaxItems =
        Number(carousel.mobile_max_items) || carouselConfig.mobileMaxItems;
    }
    if (
      "show_price" in carousel &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselShowPrice)
    ) {
      carouselConfig.showPrice = carousel.show_price !== false;
    }
    if (
      "show_cart_actions" in carousel &&
      !hasExplicitScriptValue(SCRIPT_VALUE_SPECS.carouselShowCartActions)
    ) {
      carouselConfig.showCartActions = carousel.show_cart_actions !== false;
    }
  }

  function firstTextValue(values: unknown[], fallback?: string): string {
    for (var index = 0; index < values.length; index += 1) {
      if (values[index] !== undefined && values[index] !== null && values[index] !== "") {
        return String(values[index]);
      }
    }
    return fallback || "";
  }

  function currentExternalProductId(): string {
    if (configuredProductId) return String(configuredProductId);
    try {
      if (
        window.LS &&
        window.LS.product &&
        window.LS.product.id !== undefined &&
        window.LS.product.id !== null
      ) {
        return String(window.LS.product.id);
      }
      if (
        window.UPZERO_PRODUCT_ID !== undefined &&
        window.UPZERO_PRODUCT_ID !== null
      ) {
        return String(window.UPZERO_PRODUCT_ID);
      }
      if (
        window.UPZero &&
        window.UPZero.product &&
        window.UPZero.product.id !== undefined &&
        window.UPZero.product.id !== null
      ) {
        return String(window.UPZero.product.id);
      }
    } catch (_) {}
    return "";
  }

  function track(
    storeId: string | null | undefined,
    eventType: string,
    videoId?: string | null,
    productId?: string | null,
    metadata?: Record<string, unknown>,
  ): void {
    if (!storeId) return;
    var payload = {
      store_id: storeId,
      video_id: videoId || null,
      product_id: productId || null,
      event_type: eventType,
      visitor_id: ensureVisitorId(),
      session_id: ensureSessionId(),
      url: window.location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      metadata: Object.assign(
        { widget_type: widgetType, product_url: currentProductUrl() },
        metadata || {},
      ),
    };

    // keepalive lets the request outlive the page — feed_close (with dwell
    // time) fires exactly while the storefront tab is navigating away.
    fetch(eventsBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function () {});
  }

  function createRoot(): HTMLElement {
    var root = document.createElement("div");
    root.setAttribute("data-lupp-widget-root", widgetType);
    if (
      isCarouselWidget() &&
      script &&
      script.parentNode &&
      script.parentNode !== document.head &&
      script.parentNode !== document.documentElement
    ) {
      script.parentNode.insertBefore(root, script.nextSibling);
      return root;
    }
    (document.body || document.documentElement).appendChild(root);
    return root;
  }

  var activeStore: StorePayload | null = null;
  var hasLoadedVideoList = false;
  // Server-evaluated display block for the current page (show, reason,
  // show_home_carousel) — refreshed on every context fetch.
  var lastRenderedUrl = "";
  function ensureRootAttached(root: HTMLElement): void {
    if (!root.parentNode) {
      (document.body || document.documentElement).appendChild(root);
    }
  }

  function renderForCurrentUrl(root: HTMLElement): void {
    if (!activeStore) return;
    lastRenderedUrl = window.location.href;

    if (isCarouselWidget() && carouselConfig.enabled === false) {
      debugLog("render skipped: carousel disabled", {
        hint: "settings.carousel.enabled=false ou data-home-carousel-enabled=false",
      });
      root.innerHTML = "";
      removeHomeCarouselRoot();
      return;
    }

    ensureRootAttached(root);
    // Videos already arrive filtered and ordered for the current page.
    var pageVideos = ctx.activeVideos;
    if (
      hasLoadedVideoList &&
      !pageVideos.length &&
      displayConfig.hideWithoutVideos
    ) {
      debugLog("render skipped: hide_without_videos and no matching videos");
      root.innerHTML = "";
      removeHomeCarouselRoot();
      return;
    }
    debugLog("render", {
      videoCount: pageVideos.length,
      widgetType: widgetType,
    });
    render(root, activeStore, pageVideos);
    renderEmbeddedHomeCarousel(pageVideos, root);
  }

  var lastRequestedContextUrl = "";

  // SPA navigation refetches the context for the new URL instead of filtering
  // locally; the browser HTTP cache + ETag makes repeat visits cheap. Only
  // the latest requested URL may render (out-of-order guard).
  function refreshContextForUrl(root: HTMLElement): void {
    var requestedUrl = window.location.href;
    lastRequestedContextUrl = requestedUrl;
    fetchBootstrap()
      .then(function (payload) {
        if (lastRequestedContextUrl !== requestedUrl) return;
        applyContextConfig(payload.config);
        ctx.activeVideos = payload.videos || [];
        hasLoadedVideoList = true;
        ctx.contextDisplay = payload.display || {};
        var display = ctx.contextDisplay;
        if (display.show === false) {
          debugLog("render skipped: server display rules", {
            reason: display.reason || null,
          });
          lastRenderedUrl = requestedUrl;
          root.innerHTML = "";
          removeHomeCarouselRoot();
          return;
        }
        renderForCurrentUrl(root);
      })
      .catch(function (error) {
        debugLog("context refresh failed", error.message);
      });
  }

  function watchUrlChanges(root: HTMLElement): void {
    function scheduleRender() {
      window.setTimeout(function () {
        if (window.location.href === lastRenderedUrl) return;
        refreshContextForUrl(root);
      }, 80);
    }

    (["pushState", "replaceState"] as const).forEach(function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function (this: History) {
        var result = original.apply(
          this,
          arguments as unknown as Parameters<History["pushState"]>,
        );
        scheduleRender();
        return result;
      };
    });

    window.addEventListener("popstate", scheduleRender);
    window.addEventListener("hashchange", scheduleRender);
  }

  // Must match the media query renderCarousel/its injected CSS use for
  // isMobileViewport — keeps the JS re-slice and the CSS breakpoint in sync.
  var CAROUSEL_MOBILE_BREAKPOINT = "(max-width: 640px)";

  // renderCarousel reads matchMedia once per render to pick max_items vs
  // mobile_max_items; without this, rotating a tablet or resizing past 640px
  // never re-slices the already-rendered carousel until an unrelated
  // re-render happens to fire. Re-render only on an actual breakpoint
  // crossing (not every resize tick), reusing the already-fetched video list
  // — renderForCurrentUrl issues no network request.
  function watchCarouselViewportBreakpoint(root: HTMLElement): void {
    if (typeof window.matchMedia !== "function") return;
    var query = window.matchMedia(CAROUSEL_MOBILE_BREAKPOINT);
    var onBreakpointChange = function () {
      renderForCurrentUrl(root);
    };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onBreakpointChange);
    } else if (typeof (query as any).addListener === "function") {
      // Safari < 14.
      (query as any).addListener(onBreakpointChange);
    }
  }

  var upzeroCustomerRefreshTimer: number | null = null;

  function refreshUpzeroCustomerState(root: HTMLElement): void {
    if (!isUpzeroStore(activeStore)) return;
    if (upzeroCustomerRefreshTimer) {
      window.clearTimeout(upzeroCustomerRefreshTimer);
    }
    upzeroCustomerRefreshTimer = window.setTimeout(function () {
      detectCustomerStatus(activeStore, { forceRefresh: true })
        .then(function () {
          renderForCurrentUrl(root);
        })
        .catch(function () {
          renderForCurrentUrl(root);
        });
    }, 160);
  }

  function watchUpzeroCustomerState(root: HTMLElement): void {
    var refresh = function () {
      refreshUpzeroCustomerState(root);
    };

    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target as HTMLElement | null;
        if (target && target.nodeType === 3) target = target.parentElement;
        var action =
          target && target.closest ? target.closest("a,button") : null;
        if (!action) return;
        var text = normalizeText(action.textContent || "");
        var href =
          typeof action.getAttribute === "function"
            ? String(action.getAttribute("href") || "")
            : "";
        if (
          text.indexOf("sair") > -1 ||
          text.indexOf("entrar") > -1 ||
          text.indexOf("login") > -1 ||
          /logout|login|entrar|minha-conta/i.test(href)
        ) {
          refresh();
        }
      },
      true,
    );
  }

  function renderStoriesBar(
    root: HTMLElement,
    store: StorePayload,
    videos: SlimVideo[],
  ): void {
    var accent = launcherConfig.accentColor || store.button_color || "#006BFF";
    root.innerHTML =
      '<div style="font-family:' +
      launcherConfig.fontFamily +
      ';display:flex;gap:12px;overflow:auto;padding:10px 0;color:#111">' +
      videos
        .slice(0, 8)
        .map(function (video) {
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

    root.addEventListener("click", function (event) {
      var button = (event.target as HTMLElement).closest("[data-video]");
      if (!button) return;
      openFeedOverlay(store, button.getAttribute("data-video"));
    });
  }

  function render(root: HTMLElement, store: StorePayload, videos: SlimVideo[]): void {
    if (
      !videos.length &&
      (widgetType === "floating_launcher" || widgetType === "floating_video")
    ) {
      renderLauncher(root, store, []);
      emitWidgetRendered({ videoCount: 0, widgetType: widgetType });
      return;
    }

    if (!videos.length) {
      root.innerHTML = "";
      return;
    }

    if (widgetType === "stories_bar") {
      renderStoriesBar(root, store, videos);
      emitWidgetRendered({ videoCount: videos.length, widgetType: widgetType });
      return;
    }

    if (widgetType === "floating_launcher" || widgetType === "floating_video") {
      renderLauncher(root, store, videos);
      emitWidgetRendered({ videoCount: videos.length, widgetType: widgetType });
      return;
    }

    renderCarousel(root, store, videos);
    emitWidgetRendered({ videoCount: videos.length, widgetType: widgetType });
  }

  var root = createRoot();
  watchUrlChanges(root);
  watchUpzeroCustomerState(root);
  watchCarouselViewportBreakpoint(root);

  function startWidget(): void {
    if (shouldUseBootstrap()) {
      // Single round trip: context mode returns the store, the fully
      // evaluated display/config block and the page's filtered, ordered
      // video list in one payload.
      //
      // watchUrlChanges is already listening at this point (registered
      // before runAfterPageReady even schedules startWidget), so an SPA
      // navigation can fire refreshContextForUrl while this very first
      // fetch is still in flight. Sharing its lastRequestedContextUrl guard
      // means whichever response is stale from a navigation that happened
      // meanwhile is dropped instead of unconditionally overwriting
      // whatever the newer request already rendered.
      var requestedUrl = window.location.href;
      lastRequestedContextUrl = requestedUrl;
      fetchBootstrap()
        .then(function (payload) {
          if (lastRequestedContextUrl !== requestedUrl) return;
          var store = payload.store || {
            id: null,
            slug: storeSlug || externalStoreId,
            button_color: launcherConfig.accentColor,
          };
          if (!payload.active && requireActiveWidget) {
            debugLog("abort: bootstrap inactive with require-active", {
              error: payload.error || null,
            });
            emitWidgetAborted("bootstrap_inactive", {
              error: payload.error || null,
            });
            root.remove();
            return;
          }

          if (payload.upzero_config && typeof payload.upzero_config === "object") {
            upzeroConfig = payload.upzero_config;
            sharedState.upzeroConfig = upzeroConfig;
            store.upzero_config = upzeroConfig;
            if (upzeroConfig.storefront_url && !store.url) {
              store.url = String(upzeroConfig.storefront_url);
            }
          }
          applyContextConfig(payload.config);
          ctx.contextDisplay = payload.display || {};
          var display = ctx.contextDisplay;
          if (display.show === false) {
            debugLog("abort: server display rules", {
              reason: display.reason || null,
            });
            emitWidgetAborted(display.reason || "display_rules", {
              reason: display.reason || null,
            });
            root.remove();
            return;
          }

          track(store.id, "widget_view", null, null, {
            bootstrap_mode: "context",
          });
          activeStore = store;
          sharedState.activeStore = activeStore;
          ctx.activeVideos = payload.videos || [];
          hasLoadedVideoList = true;
          var adapterPlatform = resolveAdapterPlatform(payload);
          if (adapterPlatform) {
            loadAdapter(adapterPlatform).catch(function () {});
          }
          renderForCurrentUrl(root);
        })
        .catch(function (error) {
          if (lastRequestedContextUrl !== requestedUrl) return;
          debugLog("abort: bootstrap error", error.message);
          emitWidgetAborted("bootstrap_error", { message: error.message });
          console.warn("[Luup]", error.message);
          root.remove();
        });
      return;
    }

    // Unreachable: the initial gate requires canUseBootstrap, so the
    // bootstrap path above always runs. The legacy PostgREST branch was
    // removed with the Supabase migration.
  }

  runAfterPageReady(startWidget);
})();
