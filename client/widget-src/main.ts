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
  readQueryValue,
  resolveUrl,
  sameStorefrontHostname,
} from "./utils";
import { prepareLazyVideos } from "./hls";
import type {
  AdapterPlatform,
  BootstrapPayload,
  BridgeState,
  CarouselConfig,
  CarouselServerConfig,
  CartUpdateDetail,
  ContextConfig,
  ContextDisplay,
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
    carouselMaxItems: { attr: "data-carousel-max-items", query: ["lupp_carousel_max_items"], def: "12" },
    carouselMobileMaxItems: { attr: "data-carousel-mobile-max-items", query: ["lupp_carousel_mobile_max_items"], def: "6" },
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
    maxItems: Number(rawScript.carouselMaxItems) || 12,
    mobileMaxItems: Number(rawScript.carouselMobileMaxItems) || 6,
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

  function shouldAutoplayLauncherPreview(): boolean {
    return previewMode !== "performance";
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

  function isUpzeroStore(store: StorePayload | null | undefined): boolean {
    return String((store && store.platform) || "").toLowerCase() === "upzero";
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

  function isTrustedLuppFrameOrigin(origin: string): boolean {
    try {
      var normalizedOrigin = getUrlOrigin(origin);
      var configuredOrigin = getUrlOrigin(resolveUrl(luppBaseUrl, window.location.href));
      var scriptOrigin = getUrlOrigin(script.src || "");
      if (normalizedOrigin === configuredOrigin || normalizedOrigin === scriptOrigin) {
        return true;
      }
      var hostname = getUrlHostname(normalizedOrigin);
      return (
        sameStorefrontHostname(hostname, "luup.dzns.com.br") ||
        sameStorefrontHostname(hostname, "playluup.com.br") ||
        sameStorefrontHostname(hostname, "www.playluup.com.br") ||
        /(^|\.)vercel\.app$/i.test(hostname)
      );
    } catch (_) {
      return false;
    }
  }

  function postUpzeroCustomerStatus(
    target: MessageEventSource | null,
    origin: string,
    status: CustomerStatus,
  ): void {
    if (!target || typeof target.postMessage !== "function") return;
    (target as Window).postMessage(
      {
        type: "LUPP_UPZERO_CUSTOMER_STATUS_RESPONSE",
        approved: Boolean(status.approved),
        loggedIn: Boolean(status.loggedIn),
        source: status.source || "unknown",
        status: status.status || "UNKNOWN",
      },
      origin,
    );
  }

  // Shared responder for the feed iframe's request/response postMessage
  // pairs (cart + product lookups): every response carries the same
  // requestId/ok/error envelope; extra fields (product) ride along when the
  // payload provides them.
  function postFrameResponse(
    target: MessageEventSource | Window | null,
    origin: string,
    type: string,
    requestId: unknown,
    payload: { ok?: boolean; error?: unknown; product?: unknown },
  ): void {
    if (!target || typeof target.postMessage !== "function") return;
    var message: Record<string, unknown> = {
      type: type,
      requestId: requestId,
      ok: Boolean(payload && payload.ok),
      error: payload && payload.error ? String(payload.error) : "",
    };
    if (payload && "product" in payload) {
      message.product = payload.product || null;
    }
    (target as Window).postMessage(message, origin);
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

  function primeInlineVideos(root: HTMLElement | null): void {
    if (!root || !root.querySelectorAll) return;
    try {
      Array.prototype.forEach.call(root.querySelectorAll("video"), function (video) {
        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("autoplay", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        if (video.getAttribute("data-lupp-video-src")) return;
        var playPromise = video.play && video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(function () {});
        }
      });
      prepareLazyVideos(root);
    } catch (_) {}
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

  function isFloatingWidget(): boolean {
    return widgetType === "floating_launcher" || widgetType === "floating_video";
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
  }

  function videoMediaUrl(video: Partial<SlimVideo> | null | undefined): string {
    if (!video) return "";
    return video.media_url || "";
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
  var activeVideos: SlimVideo[] = [];
  var hasLoadedVideoList = false;
  // Server-evaluated display block for the current page (show, reason,
  // show_home_carousel) — refreshed on every context fetch.
  var contextDisplay: Partial<ContextDisplay> = {};
  var lastRenderedUrl = "";
  var trackedLauncherImpressions: Record<string, boolean> = {};
  var homeCarouselRoot: HTMLElement | null = null;
  var homeCarouselAnchorObserver: MutationObserver | null = null;
  var homeCarouselAnchorRetryTimer: number | null = null;
  var homeCarouselAnchorRetryCount = 0;

  function ensureRootAttached(root: HTMLElement): void {
    if (!root.parentNode) {
      (document.body || document.documentElement).appendChild(root);
    }
  }

  function normalizeText(value: unknown): string {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function closestSection(element: Element): Element {
    var node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.tagName && node.tagName.toLowerCase() === "section") {
        return node;
      }
      node = node.parentNode as Element | null;
    }
    return element;
  }

  function hasAncestorTag(element: Element | null, tags: string[]): boolean {
    var node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      var tagName = node.tagName ? node.tagName.toLowerCase() : "";
      for (var index = 0; index < tags.length; index += 1) {
        if (tagName === tags[index]) return true;
      }
      node = node.parentNode as Element | null;
    }
    return false;
  }

  function closestHomeBlock(element: Element): Element {
    var main = document.querySelector("main, #MainContent, [role='main']");
    var node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      var tagName = node.tagName ? node.tagName.toLowerCase() : "";
      var signature = normalizeText(
        (node.id || "") + " " + (node.className || ""),
      );
      if (
        tagName === "section" ||
        tagName === "article" ||
        tagName === "ul" ||
        tagName === "ol" ||
        (main && node.parentNode === main) ||
        signature.indexOf("vitrine") !== -1 ||
        signature.indexOf("showcase") !== -1 ||
        signature.indexOf("benefit") !== -1 ||
        signature.indexOf("beneficio") !== -1 ||
        signature.indexOf("vantag") !== -1 ||
        signature.indexOf("inform") !== -1 ||
        signature.indexOf("product") !== -1 ||
        signature.indexOf("produto") !== -1 ||
        signature.indexOf("collection") !== -1 ||
        signature.indexOf("shelf") !== -1
      ) {
        return node;
      }
      node = node.parentNode as Element | null;
    }
    return element;
  }

  function closestShopifySection(element: Element): Element {
    var node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (
        node.id &&
        /^shopify-section-/i.test(String(node.id)) &&
        node.classList &&
        node.classList.contains("shopify-section")
      ) {
        return node;
      }
      if (node.tagName && node.tagName.toLowerCase() === "section") {
        return node;
      }
      node = node.parentNode as Element | null;
    }
    return element;
  }

  function findShopifyProductShowcaseSection(): Element | null {
    var primarySelectors = [
      ".product-grid",
      ".card-information__text",
      ".card-wrapper[href*='/products/']",
      ".full-unstyled-link[href*='/products/']",
      ".grid__item [href*='/products/']",
      "[class*='featured-collection']",
      "[class*='featured_collection']",
      "[id*='featured_collection']",
      "[class*='featured_collection'] .grid",
      "[id*='featured_collection'] .grid",
      "[class*='product-grid']",
      "[class*='product-card']",
      "[class*='product-item']",
      "[class*='product__item']",
      "[class*='card-product']",
      "[class*='collection__products']",
      "[class*='collection-products']",
      "[id*='featured-collection']",
      "[id*='featured_collection']",
      "product-card",
      "product-list",
      "quick-view[data-product-url]",
      "product-form",
    ];

    for (var index = 0; index < primarySelectors.length; index += 1) {
      var target = document.querySelector(primarySelectors[index]);
      if (target) return closestShopifySection(target);
    }

    var productLinks = document.querySelectorAll("a[href*='/products/']");
    for (var linkIndex = 0; linkIndex < productLinks.length; linkIndex += 1) {
      var linkSection = closestShopifySection(productLinks[linkIndex]);
      if (linkSection && linkSection !== document.body) return linkSection;
    }

    return null;
  }

  function findUpzeroProductShowcaseSection(): Element | null {
    var productLinks = document.querySelectorAll("a[href*='/produtos/']");
    for (var linkIndex = 0; linkIndex < productLinks.length; linkIndex += 1) {
      if (hasAncestorTag(productLinks[linkIndex], ["header", "nav", "footer"])) continue;
      var linkBlock = closestHomeBlock(productLinks[linkIndex]);
      if (linkBlock && linkBlock !== document.body && linkBlock !== document.documentElement) {
        return linkBlock;
      }
    }

    var selectors = [
      "[class*='vitrine']",
      "[id*='vitrine']",
      "[class*='showcase']",
      "[id*='showcase']",
      "[class*='shelf']",
      "[id*='shelf']",
      "[class*='collection']",
      "[id*='collection']",
      "[class*='product-list']",
      "[class*='product-grid']",
      "[class*='product-card']",
      "[class*='produto-list']",
      "[class*='produto-grid']",
      "[class*='produto-card']",
    ];

    for (var index = 0; index < selectors.length; index += 1) {
      var target = document.querySelector(selectors[index]);
      if (!target || hasAncestorTag(target, ["header", "nav", "footer"])) continue;
      var block = closestHomeBlock(target);
      var hasProductLink =
        target.matches("a[href*='/produtos/']") ||
        (block && block.querySelector && block.querySelector("a[href*='/produtos/']"));
      if (
        hasProductLink &&
        block &&
        block !== document.body &&
        block !== document.documentElement
      ) {
        return block;
      }
    }

    return null;
  }

  function findCarouselAnchorBySelector(): Element | null {
    var selector = String(carouselConfig.anchorSelector || "").trim();
    if (!selector) return null;
    try {
      var target = document.querySelector(selector);
      if (!target) return null;
      return closestShopifySection(target) || target;
    } catch (_) {
      return null;
    }
  }

  function insertHomeCarouselNear(anchorNode: Element | null): boolean {
    if (!anchorNode || !anchorNode.parentNode) return false;
    var placement = String(carouselConfig.anchorPlacement || "before").toLowerCase();
    if (placement === "after") {
      anchorNode.parentNode.insertBefore(homeCarouselRoot!, anchorNode.nextSibling);
    } else {
      anchorNode.parentNode.insertBefore(homeCarouselRoot!, anchorNode);
    }
    return true;
  }

  function findHomeCarouselBeforeNode(): Element | null {
    var headingTarget = normalizeText(carouselConfig.beforeHeading);
    var headings = document.querySelectorAll("h1,h2,h3,h4");
    for (var index = 0; index < headings.length; index += 1) {
      var heading = headings[index];
      var text = normalizeText(heading.textContent);
      if (headingTarget && text === headingTarget) {
        return closestSection(heading);
      }
    }

    for (var fallbackIndex = 0; fallbackIndex < headings.length; fallbackIndex += 1) {
      var fallbackHeading = headings[fallbackIndex];
      var fallbackText = normalizeText(fallbackHeading.textContent);
      if (fallbackText.indexOf("com capa") !== -1) {
        return closestSection(fallbackHeading);
      }
    }

    return null;
  }

  function findHomeBenefitsSection(): Element | null {
    var candidates: Element[] = [];
    var seen: Element[] = [];
    var selectors = [
      "section",
      "main > div",
      "main > ul",
      "main > nav",
      "[class]",
      "[id]",
    ];

    function addCandidate(candidate: Element | null) {
      if (!candidate || candidate === document.body || candidate === document.documentElement) {
        return;
      }
      if (seen.indexOf(candidate) !== -1) return;
      seen.push(candidate);
      candidates.push(candidate);
    }

    for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
      var nodes = document.querySelectorAll(selectors[selectorIndex]);
      for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        addCandidate(nodes[nodeIndex]);
      }
    }

    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (hasAncestorTag(candidate, ["header", "nav", "footer"])) continue;
      var text = normalizeText(candidate.textContent);
      if (text.length < 12 || text.length > 1500) continue;

      var score = 0;
      if (
        text.indexOf("entrega") !== -1 ||
        text.indexOf("frete") !== -1 ||
        text.indexOf("envio") !== -1
      ) {
        score += 1;
      }
      if (
        text.indexOf("exclusivo") !== -1 ||
        text.indexOf("pedido") !== -1 ||
        text.indexOf("mínimo") !== -1 ||
        text.indexOf("minimo") !== -1
      ) {
        score += 1;
      }
      if (
        text.indexOf("pagamento") !== -1 ||
        text.indexOf("parcela") !== -1 ||
        text.indexOf("cartão") !== -1 ||
        text.indexOf("cartao") !== -1
      ) {
        score += 1;
      }
      if (text.indexOf("pix") !== -1) score += 1;

      if (score >= 3) {
        return closestHomeBlock(candidate);
      }
    }
    return null;
  }

  function ensureHomeCarouselRoot(): HTMLElement | null {
    if (!homeCarouselRoot) {
      homeCarouselRoot = document.createElement("div");
      homeCarouselRoot.setAttribute("data-lupp-widget-root", "home_carousel");
      homeCarouselRoot.setAttribute("data-lupp-injected", "true");
    }

    var configuredAnchor = findCarouselAnchorBySelector();
    if (insertHomeCarouselNear(configuredAnchor)) {
      return homeCarouselRoot;
    }

    if (isUpzeroStore(activeStore)) {
      var upzeroBenefitsSection = findHomeBenefitsSection();
      if (upzeroBenefitsSection && upzeroBenefitsSection.parentNode) {
        upzeroBenefitsSection.parentNode.insertBefore(
          homeCarouselRoot,
          upzeroBenefitsSection.nextSibling,
        );
        return homeCarouselRoot;
      }

      var upzeroBeforeNode = findHomeCarouselBeforeNode();
      if (upzeroBeforeNode && upzeroBeforeNode.parentNode) {
        upzeroBeforeNode.parentNode.insertBefore(homeCarouselRoot, upzeroBeforeNode);
        return homeCarouselRoot;
      }

      var upzeroProductShowcaseSection = findUpzeroProductShowcaseSection();
      if (upzeroProductShowcaseSection && upzeroProductShowcaseSection.parentNode) {
        upzeroProductShowcaseSection.parentNode.insertBefore(
          homeCarouselRoot,
          upzeroProductShowcaseSection,
        );
        return homeCarouselRoot;
      }
    } else {
      var beforeNode = findHomeCarouselBeforeNode();
      if (beforeNode && beforeNode.parentNode) {
        beforeNode.parentNode.insertBefore(homeCarouselRoot, beforeNode);
        return homeCarouselRoot;
      }

      var benefitsSection = findHomeBenefitsSection();
      if (benefitsSection && benefitsSection.parentNode) {
        benefitsSection.parentNode.insertBefore(
          homeCarouselRoot,
          benefitsSection.nextSibling,
        );
        return homeCarouselRoot;
      }

      var productShowcaseSection = findShopifyProductShowcaseSection();
      if (productShowcaseSection && productShowcaseSection.parentNode) {
        productShowcaseSection.parentNode.insertBefore(
          homeCarouselRoot,
          productShowcaseSection,
        );
        return homeCarouselRoot;
      }
    }

    var main = document.querySelector("main, #MainContent, [role='main']");
    if (main) {
      main.insertBefore(homeCarouselRoot, main.firstChild || null);
      return homeCarouselRoot;
    }

    return null;
  }

  function removeHomeCarouselRoot(): void {
    if (homeCarouselRoot && homeCarouselRoot.parentNode) {
      homeCarouselRoot.parentNode.removeChild(homeCarouselRoot);
    }
  }

  function hasHomeCarouselAnchor(): boolean {
    return Boolean(
      findCarouselAnchorBySelector() ||
        findHomeCarouselBeforeNode() ||
        findHomeBenefitsSection() ||
        (isUpzeroStore(activeStore) ? findUpzeroProductShowcaseSection() : null) ||
        findShopifyProductShowcaseSection() ||
        document.querySelector("main, #MainContent, [role='main']"),
    );
  }

  function clearHomeCarouselAnchorWatch(): void {
    if (homeCarouselAnchorObserver) {
      homeCarouselAnchorObserver.disconnect();
      homeCarouselAnchorObserver = null;
    }
    if (homeCarouselAnchorRetryTimer) {
      window.clearTimeout(homeCarouselAnchorRetryTimer);
      homeCarouselAnchorRetryTimer = null;
    }
  }

  function scheduleHomeCarouselAnchorRetry(root: HTMLElement): void {
    if (!root || !shouldRenderEmbeddedHomeCarousel()) return;
    if (homeCarouselAnchorRetryTimer || homeCarouselAnchorObserver) return;

    if ("MutationObserver" in window && document.body) {
      homeCarouselAnchorObserver = new MutationObserver(function () {
        // The observer can fire during page teardown, when the document is
        // already being destroyed.
        if (!document || !document.body) return;
        if (!hasHomeCarouselAnchor()) return;
        clearHomeCarouselAnchorWatch();
        homeCarouselAnchorRetryCount = 0;
        renderForCurrentUrl(root);
      });
      homeCarouselAnchorObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    if (homeCarouselAnchorRetryCount >= 12) return;
    homeCarouselAnchorRetryCount += 1;
    homeCarouselAnchorRetryTimer = window.setTimeout(function () {
      homeCarouselAnchorRetryTimer = null;
      if (hasHomeCarouselAnchor()) {
        clearHomeCarouselAnchorWatch();
        homeCarouselAnchorRetryCount = 0;
      }
      renderForCurrentUrl(root);
    }, Math.min(1600, 250 + homeCarouselAnchorRetryCount * 180));
  }

  // Page scoping is server-evaluated: display.show_home_carousel is true only
  // on the storefront home with the home experience on and the carousel
  // plan-allowed, per the current context URL.
  function shouldRenderEmbeddedHomeCarousel(): boolean {
    return isFloatingWidget() && contextDisplay.show_home_carousel === true;
  }

  function renderEmbeddedHomeCarousel(videos: SlimVideo[], root: HTMLElement): void {
    if (!shouldRenderEmbeddedHomeCarousel()) {
      clearHomeCarouselAnchorWatch();
      removeHomeCarouselRoot();
      return;
    }

    if (!videos.length) {
      removeHomeCarouselRoot();
      return;
    }

    var carouselRoot = ensureHomeCarouselRoot();
    if (!carouselRoot) {
      removeHomeCarouselRoot();
      scheduleHomeCarouselAnchorRetry(root);
      return;
    }

    clearHomeCarouselAnchorWatch();
    homeCarouselAnchorRetryCount = 0;
    renderCarousel(carouselRoot, activeStore as StorePayload, videos);
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
    var pageVideos = activeVideos;
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
        activeVideos = payload.videos || [];
        hasLoadedVideoList = true;
        contextDisplay = payload.display || {};
        var display = contextDisplay;
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

  function positionStyles(): string {
    if (nubesdkFrameMode === "launcher") {
      return "position:relative;z-index:1;left:0;top:0;right:auto;bottom:auto";
    }
    var styles = ["position:fixed", "z-index:2147483000"];
    var x = launcherConfig.offsetX + "px";
    var y = launcherConfig.offsetY + "px";

    if (launcherConfig.position.indexOf("top") === 0) styles.push("top:" + y);
    else styles.push("bottom:" + y);

    if (launcherConfig.position.indexOf("right") > -1)
      styles.push("right:" + x);
    else styles.push("left:" + x);

    return styles.join(";");
  }

  function launcherDragStorageKey(store: StorePayload | null): string {
    var storeKey =
      (store && (store.id || store.slug)) ||
      storeId ||
      externalStoreId ||
      storeSlug ||
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
      startLeft: number;
      startTop: number;
      startX: number;
      startY: number;
      lastPosition: { x: number; y: number } | null;
    }
    var state: DragState | null = null;
    var previousUserSelect = "";

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
      var position = clampLauncherPosition(
        root,
        state.startLeft + deltaX,
        state.startTop + deltaY,
      );
      applyLauncherDragPosition(root, position);
      state.lastPosition = position;
    }

    function onEnd() {
      if (!state) return;
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

  function previewVideoFor(
    videoId: string | null | undefined,
    fallbackVideo?: Partial<SlimVideo> | null,
  ): Partial<SlimVideo> | null {
    if (
      fallbackVideo &&
      (fallbackVideo.media_url || fallbackVideo.thumbnail_url)
    )
      return fallbackVideo;
    if (!videoId) return activeVideos[0] || null;
    for (var index = 0; index < activeVideos.length; index += 1) {
      if (String(activeVideos[index].id) === String(videoId))
        return activeVideos[index];
    }
    return activeVideos[0] || null;
  }

  function openFeedOverlay(
    store: StorePayload,
    videoId?: string | null,
    fallbackVideo?: Partial<SlimVideo> | null,
    productUrlOverride?: string,
  ): void {
    if (nubesdkFrameMode) {
      var framePreviewVideo = previewVideoFor(videoId, fallbackVideo);
      try {
        window.parent.postMessage(
          {
            type: "LUPP_NUBESDK_OPEN_FEED",
            videoId: videoId || "",
            productUrl: productUrlOverride || currentProductUrl(),
            previewVideoUrl: framePreviewVideo
              ? videoMediaUrl(framePreviewVideo)
              : "",
            previewPosterUrl:
              framePreviewVideo && framePreviewVideo.thumbnail_url
                ? framePreviewVideo.thumbnail_url
                : "",
          },
          "*",
        );
        if (store && store.id) {
          track(store.id, "feed_open", videoId || null, null, {
            opened_from: "nubesdk_frame",
          });
        }
      } catch (_) {}
      return;
    }

    var existing = document.querySelector("[data-lupp-feed-overlay]");
    if (existing) existing.remove();

    var previousOverflow = document.body.style.overflow;
    var openedAt = Date.now();
    var closeTracked = false;
    document.body.style.overflow = "hidden";

    var overlay = document.createElement("div");
    overlay.setAttribute("data-lupp-feed-overlay", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;font-family:" +
      launcherConfig.fontFamily +
      ";";

    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Fechar feed Luup");
    close.style.cssText =
      "position:absolute;right:16px;top:16px;width:42px;height:42px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:28px;line-height:1;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);";
    close.innerHTML = "&times;";

    var frame = document.createElement("iframe");
    var previewVideo = previewVideoFor(videoId, fallbackVideo);
    frame.title = "Feed vertical Luup";
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen";
    frame.style.cssText =
      "width:min(100vw,430px);height:100dvh;max-height:100dvh;border:0;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.42);";

    function setFrameSrc(customerStatus: CustomerStatus) {
      var params =
        "/feed?embed=1" +
        "&autoplay_sound=1" +
        (videoId ? "&v=" + encodeURIComponent(videoId) : "") +
        "&product_url=" +
        encodeURIComponent(productUrlOverride || currentProductUrl()) +
        "&customer_logged_in=" +
        (customerStatus.loggedIn ? "1" : "0") +
        "&customer_approved=" +
        (customerStatus.approved ? "1" : "0") +
        "&customer_status=" +
        encodeURIComponent(customerStatus.status || "UNKNOWN");

      frame.src =
        luppBaseUrl +
        "/s/" +
        encodeURIComponent(store.slug as string) +
        params +
        (previewVideo && videoMediaUrl(previewVideo)
          ? "&preview_video_url=" + encodeURIComponent(videoMediaUrl(previewVideo))
          : "") +
        (previewVideo && previewVideo.thumbnail_url
          ? "&preview_poster_url=" +
            encodeURIComponent(previewVideo.thumbnail_url)
          : "");
    }

    var shouldForceCustomerRefresh = isUpzeroStore(store);
    var initialCustomerStatus =
      sharedState.upzeroCustomerStatusCache && sharedState.upzeroCustomerStatusCache.approved
        ? sharedState.upzeroCustomerStatusCache
        : {
            approved: false,
            loggedIn: false,
            status: shouldForceCustomerRefresh ? "CHECKING" : "not_applicable",
          };

    setFrameSrc(initialCustomerStatus);
    detectCustomerStatus(store, {
      forceRefresh: shouldForceCustomerRefresh,
    }).then(function (customerStatus) {
      setFrameSrc(customerStatus);
    });

    var feedbackShown = false;

    function trackFeedClose(reason?: string) {
      if (closeTracked) return;
      closeTracked = true;
      var durationSeconds = Math.max(
        0,
        Math.round((Date.now() - openedAt) / 1000),
      );
      track(store.id, "feed_close", videoId || null, null, {
        close_reason: reason || "close",
        duration_seconds: durationSeconds,
        duration_ms: Date.now() - openedAt,
        had_cart_update: !!sharedState.pendingStorefrontCartRefresh,
      });
    }

    function destroyOverlay(reason?: string) {
      trackFeedClose(reason);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      flushPendingStorefrontCartRefresh();
    }

    function showFeedbackForm() {
      if (feedbackShown) {
        destroyOverlay("feedback_already_open");
        return;
      }

      feedbackShown = true;
      frame.style.filter = "blur(12px) brightness(.58)";
      overlay.style.background = "rgba(0,0,0,.62)";
      close.style.display = "none";

      var selected = "";
      var selectedRating = 0;
      var feedbackLogoUrl = resolveUrl(
        "/luup-logo-completa-white.png",
        luppBaseUrl,
      );
      var feedback = document.createElement("div");
      feedback.setAttribute("data-lupp-feedback", "true");
      feedback.style.cssText =
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;color:#fff;";

      feedback.innerHTML =
        '<div style="width:min(100%,430px);height:min(100dvh,805px);border-radius:18px;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.28),rgba(255,255,255,.08) 42%,rgba(0,0,0,.34));box-shadow:0 28px 90px rgba(0,0,0,.55);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);padding:26px 28px;display:flex;flex-direction:column;justify-content:center;gap:14px;">' +
        '<a href="' +
        escapeHtml(luppBaseUrl || "https://luup.dzns.com.br") +
        '" target="_blank" rel="noopener noreferrer" aria-label="Luup" style="display:flex;justify-content:center;margin-bottom:4px;text-decoration:none;"><img src="' +
        escapeHtml(feedbackLogoUrl) +
        '" alt="Luup" style="height:42px;max-width:150px;object-fit:contain;display:block;"/></a>' +
        '<div style="text-align:center;margin-bottom:8px;"><h2 style="margin:0 0 8px;font-size:20px;line-height:1.1;font-weight:800;">Queremos saber sua opinião!</h2><p style="margin:0 auto;max-width:360px;font-size:12px;line-height:1.15;font-weight:700;color:rgba(255,255,255,.92);">Sua experiência é muito importante para nós. Responda rapidamente e ajude-nos a melhorar cada vez mais.</p></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;"><div style="border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(255,255,255,.12);padding:10px;text-align:center;"><strong style="display:block;font-size:18px;line-height:1;">0</strong><span style="display:block;margin-top:3px;font-size:11px;font-weight:800;color:rgba(255,255,255,.76);">Comentários</span></div><div style="border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(255,255,255,.12);padding:10px;text-align:center;"><strong data-lupp-rating-count style="display:block;font-size:18px;line-height:1;">0/5</strong><span style="display:block;margin-top:3px;font-size:11px;font-weight:800;color:rgba(255,255,255,.76);">Estrelas</span></div></div>' +
        '<div data-lupp-feedback-stars style="display:flex;justify-content:center;gap:8px;margin-bottom:10px;"></div>' +
        '<div data-lupp-feedback-options style="display:grid;gap:10px;"></div>' +
        '<textarea data-lupp-feedback-text placeholder="Deixe aqui sua sugestão do que achou ou de como podemos melhorar." style="margin-top:24px;width:100%;min-height:66px;resize:none;border:1px solid rgba(255,255,255,.32);border-radius:9px;background:rgba(255,255,255,.13);color:#fff;outline:none;padding:14px;font-family:inherit;font-size:13px;font-weight:600;line-height:1.4;box-sizing:border-box;"></textarea>' +
        '<button data-lupp-feedback-submit type="button" style="height:40px;border:0;border-radius:5px;background:#fff;color:#050505;font-family:inherit;font-size:15px;font-weight:800;line-height:1;cursor:pointer;">Enviar Feedback</button>' +
        '<button data-lupp-feedback-skip type="button" style="height:40px;border:0;background:transparent;color:#fff;font-family:inherit;font-size:16px;font-weight:800;line-height:1;cursor:pointer;">Agora não</button>' +
        "</div>";

      var options = [
        "A experiência foi incrível",
        "Atendeu às expectativas",
        "Poderia ser melhor",
        "Prefiro ver somente fotos",
      ];
      var optionList = feedback.querySelector("[data-lupp-feedback-options]")!;
      var starList = feedback.querySelector("[data-lupp-feedback-stars]")!;
      var ratingCount = feedback.querySelector("[data-lupp-rating-count]")!;

      function renderStars() {
        starList.innerHTML = [1, 2, 3, 4, 5]
          .map(function (rating) {
            return (
              '<button data-lupp-feedback-star="' +
              rating +
              '" type="button" aria-label="' +
              rating +
              ' estrelas" style="border:0;background:transparent;color:' +
              (selectedRating >= rating ? "#facc15" : "rgba(255,255,255,.38)") +
              ';font-size:30px;line-height:1;cursor:pointer;padding:0 2px;">★</button>'
            );
          })
          .join("");
        ratingCount.textContent = selectedRating + "/5";
      }

      function renderOptions() {
        optionList.innerHTML = options
          .map(function (option) {
            var active = selected === option;
            return (
              '<button data-lupp-feedback-option="' +
              escapeHtml(option) +
              '" type="button" style="height:42px;display:flex;align-items:center;gap:14px;border:1px solid rgba(255,255,255,.34);border-radius:9px;background:' +
              (active ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.15)") +
              ';color:#fff;text-align:left;padding:0 12px;font-family:inherit;font-size:14px;font-weight:800;line-height:1;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);"><span style="width:20px;height:20px;border-radius:999px;background:rgba(255,255,255,.86);color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;">✓</span><span>' +
              escapeHtml(option) +
              "</span></button>"
            );
          })
          .join("");
      }

      renderStars();
      renderOptions();
      feedback.addEventListener("click", function (event) {
        event.stopPropagation();
        var eventTarget = event.target as HTMLElement;
        var starButton = eventTarget.closest("[data-lupp-feedback-star]");
        if (starButton) {
          selectedRating = Number(
            starButton.getAttribute("data-lupp-feedback-star") || 0,
          );
          renderStars();
          return;
        }

        var optionButton = eventTarget.closest("[data-lupp-feedback-option]");
        if (optionButton) {
          selected =
            optionButton.getAttribute("data-lupp-feedback-option") || "";
          renderOptions();
          return;
        }

        if (eventTarget.closest("[data-lupp-feedback-submit]")) {
          var text =
            (
              feedback.querySelector(
                "[data-lupp-feedback-text]",
              ) as HTMLTextAreaElement
            ).value || "";
          track(store.id, "widget_view", videoId || null, null, {
            action: "feedback_submit",
            feedback_option: selected,
            feedback_rating: selectedRating,
            feedback_text: text,
          });
          destroyOverlay("feedback_submit");
          return;
        }

        if (eventTarget.closest("[data-lupp-feedback-skip]")) {
          track(store.id, "widget_view", videoId || null, null, {
            action: "feedback_skip",
          });
          destroyOverlay("feedback_skip");
        }
      });

      overlay.appendChild(feedback);
    }

    close.addEventListener("click", showFeedbackForm);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) showFeedbackForm();
    });
    document.addEventListener("keydown", function onKeydown(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", onKeydown);
      showFeedbackForm();
    });

    overlay.appendChild(frame);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    track(store.id, "feed_open", videoId || null, null, {
      opened_from: "floating_launcher",
    });
  }

  function trackLauncherImpression(
    root: HTMLElement,
    store: StorePayload,
    video: Partial<SlimVideo> | undefined,
  ): void {
    if (!store || !store.id) return;
    var key = [store.id, currentProductUrl(), widgetType].join("|");
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
      track(store.id, "launcher_impression", video && video.id ? video.id : null, null, {
        launcher_position: launcherConfig.position,
        launcher_model: launcherConfig.model,
        launcher_size: launcherConfig.bubbleSize,
        has_video_preview: !!(video && videoMediaUrl(video)),
      });
    }, 250);
  }

  function renderLauncher(
    root: HTMLElement,
    store: StorePayload,
    videos: SlimVideo[],
  ): void {
    var video = videos[0] || {};
    var size = Math.max(56, launcherConfig.bubbleSize);
    var model = launcherConfig.model || "circular";
    var isRectangular = model === "rectangular";
    var isSquare = model === "square";
    var isInsta = model.indexOf("insta") > -1 || model === "highlight";
    var width = isRectangular ? Math.round(size * 1.35) : size;
    var height = isRectangular ? Math.round(size * 0.78) : size;
    var radius = isRectangular || isSquare ? "18px" : "999px";
    var mediaRadius = radius;
    var ring = isInsta
      ? "linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)"
      : launcherConfig.backgroundColor;
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
            launcherConfig.textColor +
            '">▶</span>';

    root.style.cssText =
      positionStyles() +
      ";will-change:transform,left,top;touch-action:none;-webkit-user-select:none;user-select:none;";
    root.innerHTML =
      '<button type="button" data-lupp-launcher style="' +
      "display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:0;cursor:grab;touch-action:none;font-family:" +
      launcherConfig.fontFamily +
      ';filter:drop-shadow(0 14px 28px rgba(0,0,0,.28));">' +
      '<span style="position:relative;display:block;width:' +
      width +
      "px;height:" +
      height +
      "px;border-radius:" +
      radius +
      ";background:" +
      ring +
      ";border:3px solid #fff;box-shadow:0 0 0 2px " +
      launcherConfig.accentColor +
      ',0 12px 32px rgba(0,0,0,.32);overflow:hidden">' +
      (isInsta
        ? '<span style="display:block;width:100%;height:100%;padding:3px;box-sizing:border-box;border-radius:' +
          radius +
          '">'
        : "") +
      media +
      (isInsta ? "</span>" : "") +
      '<span style="position:absolute;right:3px;bottom:3px;width:17px;height:17px;border-radius:999px;background:' +
      launcherConfig.accentColor +
      ';border:2px solid #fff"></span></span>' +
      (launcherConfig.label
        ? '<span style="max-width:158px;border-radius:999px;background:' +
          launcherConfig.backgroundColor +
          ";color:" +
          launcherConfig.textColor +
          ';padding:8px 12px;font-size:12px;font-weight:800;line-height:1.15;white-space:nowrap">' +
          escapeHtml(launcherConfig.label) +
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

  function renderCarousel(
    root: HTMLElement,
    store: StorePayload,
    videos: SlimVideo[],
  ): void {
    var accent = launcherConfig.accentColor || store.button_color || "#006BFF";
    var isMobileViewport =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 640px)").matches;
    var configuredMaxItems = isMobileViewport
      ? carouselConfig.mobileMaxItems
      : carouselConfig.maxItems;
    var items = videos.slice(0, Math.max(1, Number(configuredMaxItems) || 1));
    var upzeroCustomerStatus = isUpzeroStore(store)
      ? sharedState.upzeroCustomerStatusCache
      : { approved: true, loggedIn: true };
    var descriptionHtml = carouselConfig.description
      ? '<p class="lupp-home-carousel-description">' +
        escapeHtml(carouselConfig.description) +
        "</p>"
      : "";

    function productCardHtml(video: SlimVideo): string {
      // Slim server product: name/image fallback chains and pt-BR price
      // formatting are already resolved server-side.
      var product = video.product || null;
      var imageUrl = (product && product.image_url) || "";
      var name = (product && product.name) || "";
      var restricted =
        isUpzeroStore(store) &&
        !(upzeroCustomerStatus && upzeroCustomerStatus.approved);
      var price = restricted ? "" : (product && product.price_label) || "";
      var subtitle = restricted
        ? "Entre ou cadastre-se para visualizar valores."
        : price || "Disponível para compra.";
      var actionLabel = isUpzeroStore(store)
        ? restricted
          ? upzeroCustomerStatus && upzeroCustomerStatus.loggedIn
            ? "Aguardando aprovação"
            : "Cadastre-se para ver o preço"
          : "Comprar"
        : "Comprar";

      return (
        '<span class="lupp-home-carousel-product">' +
        '<span class="lupp-home-carousel-product-main">' +
        (imageUrl
          ? '<img class="lupp-home-carousel-product-image" src="' +
            escapeHtml(imageUrl) +
            '" alt="" loading="lazy" decoding="async">'
          : '<span class="lupp-home-carousel-product-image lupp-home-carousel-product-placeholder" aria-hidden="true"></span>') +
        '<span class="lupp-home-carousel-product-copy">' +
        '<span class="lupp-home-carousel-product-name">' +
        escapeHtml(name) +
        "</span>" +
        '<span class="lupp-home-carousel-product-price">' +
        escapeHtml(subtitle) +
        "</span>" +
        "</span></span>" +
        '<span class="lupp-home-carousel-product-divider"></span>' +
        '<span class="lupp-home-carousel-product-cta">' +
        escapeHtml(actionLabel) +
        "</span></span>"
      );
    }

    root.innerHTML =
      '<section class="lupp-home-carousel" aria-label="' +
      escapeHtml(carouselConfig.title) +
      '">' +
      "<style>" +
      ".lupp-home-carousel{font-family:" +
      launcherConfig.fontFamily +
      ";box-sizing:border-box;width:100%;max-width:100vw;padding:24px 0 30px;background:#fff;color:#16171a;overflow:hidden}" +
      ".lupp-home-carousel *{box-sizing:border-box}" +
      ".lupp-home-carousel-title{margin:0 16px 22px;text-align:center;font-size:clamp(18px,2vw,29px);font-weight:500;letter-spacing:0;line-height:1.2;color:#202124}" +
      ".lupp-home-carousel-description{max-width:680px;margin:-12px auto 22px;padding:0 16px;text-align:center;color:#64748b;font-size:14px;font-weight:600;line-height:1.5;letter-spacing:0}" +
      ".lupp-home-carousel-track{display:flex;gap:clamp(18px,2.5vw,48px);overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;padding:4px max(16px,calc((100vw - 1240px)/2)) 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}" +
      ".lupp-home-carousel-track::-webkit-scrollbar{display:none}" +
      ".lupp-home-carousel-card{position:relative;display:block;flex:0 0 clamp(178px,14.2vw,250px);aspect-ratio:9/16;border:0;border-radius:12px;background:#f3f4f6;box-shadow:0 14px 28px rgba(15,23,42,.12);overflow:hidden;cursor:pointer;scroll-snap-align:center;padding:0;color:inherit}" +
      ".lupp-home-carousel-card:nth-child(4n){flex-basis:clamp(190px,15.5vw,270px)}" +
      ".lupp-home-carousel-thumb{width:100%;height:100%;display:block;object-fit:cover;background:#e5e7eb;transition:transform .28s ease}" +
      ".lupp-home-carousel-card:hover .lupp-home-carousel-thumb{transform:scale(1.025)}" +
      ".lupp-home-carousel-product{position:absolute;left:8px;right:8px;bottom:9px;display:flex;flex-direction:column;align-items:stretch;gap:0;min-height:78px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(72,82,72,.82);box-shadow:0 10px 24px rgba(15,23,42,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:left;overflow:hidden}" +
      ".lupp-home-carousel-product-main{display:flex;align-items:center;gap:7px;min-width:0;padding:7px 8px}" +
      ".lupp-home-carousel-product-image{display:block;flex:0 0 42px;width:42px;height:42px;border-radius:8px;object-fit:cover;background:#eef2f7;border:1px solid rgba(255,255,255,.22)}" +
      ".lupp-home-carousel-product-placeholder{background:" +
      accent +
      "}" +
      ".lupp-home-carousel-product-copy{min-width:0;display:block;flex:1;color:#fff}" +
      ".lupp-home-carousel-product-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;font-weight:700;line-height:1.15;letter-spacing:0;text-transform:uppercase}" +
      ".lupp-home-carousel-product-price{display:block;margin-top:4px;color:rgba(255,255,255,.84);font-size:11px;font-weight:600;line-height:1.2;letter-spacing:0}" +
      ".lupp-home-carousel-product-divider{display:block;height:1px;background:rgba(255,255,255,.14)}" +
      ".lupp-home-carousel-product-cta{margin:7px 8px 8px;display:flex;align-items:center;justify-content:center;min-height:32px;border-radius:10px;background:#fff;color:#070d1d;border:2px solid " +
      accent +
      ";padding:7px 9px;text-align:center;font-size:11px;font-weight:800;line-height:1.1;letter-spacing:0}" +
      "@media(max-width:640px){.lupp-home-carousel{padding:20px 0 24px}.lupp-home-carousel-track{gap:14px;padding-left:14px;padding-right:14px}.lupp-home-carousel-card{flex-basis:62vw}.lupp-home-carousel-card:nth-child(4n){flex-basis:66vw}.lupp-home-carousel-product{min-height:82px}.lupp-home-carousel-product-name{font-size:12px}.lupp-home-carousel-product-price{font-size:10.5px}.lupp-home-carousel-product-cta{min-height:31px;font-size:11px}}" +
      "</style>" +
      '<h2 class="lupp-home-carousel-title">' +
      escapeHtml(carouselConfig.title) +
      "</h2>" +
      descriptionHtml +
      '<div class="lupp-home-carousel-track">' +
      items
        .map(function (video) {
          var thumbnailUrl = video.thumbnail_url || "";
          var mediaUrl = videoMediaUrl(video);
          return (
            '<button type="button" class="lupp-home-carousel-card" data-video="' +
            video.id +
            '" aria-label="Abrir vídeo ' +
            escapeHtml(video.title || "Luup") +
            '">' +
            (mediaUrl
              ? '<video class="lupp-home-carousel-thumb" muted playsinline loop autoplay preload="metadata" data-lupp-video-quality="preview" data-lupp-video-src="' +
                escapeHtml(mediaUrl) +
                '" poster="' +
                escapeHtml(thumbnailUrl) +
                '"></video>'
              : thumbnailUrl
              ? '<img class="lupp-home-carousel-thumb" src="' +
                escapeHtml(thumbnailUrl) +
                '" alt="" loading="lazy" decoding="async">'
              : '<span class="lupp-home-carousel-thumb" aria-hidden="true"></span>') +
            productCardHtml(video) +
            "</button>"
          );
        })
        .join("") +
      "</div></section>";

    primeInlineVideos(root);

    root.onclick = function (event) {
      var target = event.target as HTMLElement | null;
      if (target && target.nodeType === 3) target = target.parentElement;
      var button = target && target.closest ? target.closest("[data-video]") : null;
      if (!button) return;
      var videoId = button.getAttribute("data-video");
      var fallbackVideo = null;
      for (var index = 0; index < items.length; index += 1) {
        if (String(items[index].id) === String(videoId)) {
          fallbackVideo = items[index];
          break;
        }
      }
      if (store && store.id) {
        track(store.id, "home_carousel_click", videoId, null, {
          source: "home_carousel_click",
        });
      }
      var linkedProduct =
        fallbackVideo && fallbackVideo.product ? fallbackVideo.product : null;
      var linkedProductUrl =
        linkedProduct && linkedProduct.product_url
          ? isUpzeroStore(store)
            ? repairUpzeroProductUrl(linkedProduct, linkedProduct.product_url, store)
            : linkedProduct.product_url
          : "";
      openFeedOverlay(store, videoId, fallbackVideo, linkedProductUrl);
    };

    if (
      isUpzeroStore(store) &&
      (!sharedState.upzeroCustomerStatusCache ||
        Date.now() - sharedState.upzeroCustomerStatusLastRefreshAt > 2500)
    ) {
      var statusKeyBeforeRefresh = sharedState.upzeroCustomerStatusCache
        ? String(sharedState.upzeroCustomerStatusCache.status) +
          ":" +
          String(sharedState.upzeroCustomerStatusCache.approved)
        : "";
      detectCustomerStatus(store, { forceRefresh: true })
        .then(function () {
          var statusKeyAfterRefresh = sharedState.upzeroCustomerStatusCache
            ? String(sharedState.upzeroCustomerStatusCache.status) +
              ":" +
              String(sharedState.upzeroCustomerStatusCache.approved)
            : "";
          // Only re-render on an actual status change; re-rendering
          // unconditionally loops forever for logged-out visitors.
          if (statusKeyAfterRefresh === statusKeyBeforeRefresh) return;
          if (root && root.parentNode) renderCarousel(root, store, videos);
        })
        .catch(function (error: unknown) {
          debugLog("carousel: upzero status refresh failed", error);
        });
    }
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

  function startWidget(): void {
    if (shouldUseBootstrap()) {
      // Single round trip: context mode returns the store, the fully
      // evaluated display/config block and the page's filtered, ordered
      // video list in one payload.
      fetchBootstrap()
        .then(function (payload) {
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
          contextDisplay = payload.display || {};
          var display = contextDisplay;
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
          activeVideos = payload.videos || [];
          hasLoadedVideoList = true;
          var adapterPlatform = resolveAdapterPlatform(payload);
          if (adapterPlatform) {
            loadAdapter(adapterPlatform).catch(function () {});
          }
          renderForCurrentUrl(root);
        })
        .catch(function (error) {
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
