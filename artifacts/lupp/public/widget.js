(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  // Opt-in diagnostics: set window.__LUUP_DEBUG__ = true before the widget
  // loads to trace config resolution, bootstrap calls and abort reasons.
  function debugLog() {
    try {
      if (!window.__LUUP_DEBUG__) return;
      var args = ["[Luup:debug]"];
      for (var argIndex = 0; argIndex < arguments.length; argIndex += 1) {
        args.push(arguments[argIndex]);
      }
      console.log.apply(console, args);
    } catch (_) {}
  }

  // Lifecycle handshake for wrapper scripts (e.g. the Nuvemshop light
  // launcher): they must not remove their placeholder until the widget
  // actually renders, and must clean up immediately when it aborts.
  function emitWidgetLifecycleEvent(name, detail) {
    try {
      var event;
      if (typeof window.CustomEvent === "function") {
        event = new CustomEvent(name, { detail: detail || {} });
      } else {
        event = document.createEvent("CustomEvent");
        event.initCustomEvent(name, false, false, detail || {});
      }
      document.dispatchEvent(event);
    } catch (_) {}
  }

  function emitWidgetAborted(reason, detail) {
    var payload = detail || {};
    payload.reason = reason;
    emitWidgetLifecycleEvent("luup:widget-aborted", payload);
  }

  function emitWidgetRendered(detail) {
    emitWidgetLifecycleEvent("luup:widget-rendered", detail || {});
  }

  function createAnchor(url) {
    var anchor = document.createElement("a");
    anchor.href = url || window.location.href;
    return anchor;
  }

  function resolveUrl(value, base) {
    try {
      if (typeof URL !== "undefined") return new URL(value, base).href;
    } catch (_) {}
    try {
      var anchor = createAnchor(base || window.location.href);
      var resolver = document.createElement("a");
      resolver.href = anchor.href;
      resolver.href = value || "";
      return resolver.href;
    } catch (_) {
      return String(value || "");
    }
  }

  function getUrlOrigin(value) {
    try {
      if (typeof URL !== "undefined") return new URL(value).origin;
    } catch (_) {}
    var anchor = createAnchor(value);
    return (
      anchor.protocol +
      "//" +
      anchor.hostname +
      (anchor.port ? ":" + anchor.port : "")
    );
  }

  function getUrlHostname(value) {
    try {
      if (typeof URL !== "undefined") return new URL(value, window.location.href).hostname;
    } catch (_) {}
    return createAnchor(resolveUrl(value, window.location.href)).hostname;
  }

  function normalizedHostname(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/^www\./, "");
  }

  function sameStorefrontHostname(left, right) {
    return normalizedHostname(left) === normalizedHostname(right);
  }

  function getUrlPathname(value, base) {
    try {
      if (typeof URL !== "undefined") return new URL(value, base).pathname;
    } catch (_) {}
    return createAnchor(resolveUrl(value, base || window.location.href)).pathname || "/";
  }

  function readQueryValue(url, name) {
    var queryIndex = String(url || "").indexOf("?");
    if (queryIndex === -1) return null;
    var hashIndex = String(url).indexOf("#", queryIndex);
    var query = String(url).slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
    var parts = query.split("&");
    for (var index = 0; index < parts.length; index += 1) {
      var pair = parts[index].split("=");
      try {
        if (decodeURIComponent(pair[0] || "") === name) {
          return decodeURIComponent((pair[1] || "").replace(/\+/g, " "));
        }
      } catch (_) {}
    }
    return null;
  }

  var hlsScriptPromise = null;

  function isHlsUrl(value) {
    return /\.m3u8(?:$|\?)/i.test(String(value || ""));
  }

  function canPlayNativeHls(video) {
    return Boolean(video && video.canPlayType("application/vnd.apple.mpegurl"));
  }

  function loadHlsScript() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsScriptPromise) return hlsScriptPromise;
    hlsScriptPromise = new Promise(function (resolve, reject) {
      var hlsScript = document.createElement("script");
      hlsScript.async = true;
      hlsScript.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
      hlsScript.onload = function () {
        resolve(window.Hls);
      };
      hlsScript.onerror = function () {
        reject(new Error("hls_load_failed"));
      };
      document.head.appendChild(hlsScript);
    });
    return hlsScriptPromise;
  }

  function attachVideoSource(video) {
    if (!video || video.getAttribute("data-lupp-video-loaded") === "true") return;
    var src = video.getAttribute("data-lupp-video-src");
    if (!src) return;
    video.setAttribute("data-lupp-video-loaded", "true");

    if (!isHlsUrl(src) || canPlayNativeHls(video)) {
      video.src = src;
      if (video.autoplay) video.play().catch(function () {});
      return;
    }

    loadHlsScript()
      .then(function (Hls) {
        if (!Hls || !Hls.isSupported()) return;
        var previewQuality =
          video.getAttribute("data-lupp-video-quality") === "preview";
        var hls = new Hls({
          capLevelToPlayerSize: true,
          enableWorker: true,
          maxBufferLength: previewQuality ? 6 : 30,
          maxMaxBufferLength: previewQuality ? 10 : 60,
          startLevel: previewQuality ? 0 : -1,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        if (previewQuality && Hls.Events && Hls.Events.MANIFEST_PARSED) {
          hls.on(Hls.Events.MANIFEST_PARSED, function () {
            try {
              hls.currentLevel = 0;
              hls.nextLevel = 0;
            } catch (_) {}
          });
        }
        video.__luppHls = hls;
        if (video.autoplay) video.play().catch(function () {});
      })
      .catch(function () {});
  }

  function prepareLazyVideos(root) {
    var videos = Array.prototype.slice.call(
      root.querySelectorAll("video[data-lupp-video-src]"),
    );
    if (!videos.length) return;

    if (!("IntersectionObserver" in window)) {
      videos.forEach(attachVideoSource);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            attachVideoSource(entry.target);
            observer.unobserve(entry.target);
          } else if (entry.target.pause) {
            entry.target.pause();
          }
        });
      },
      { rootMargin: "260px 0px", threshold: 0.05 },
    );

    videos.forEach(function (video) {
      observer.observe(video);
    });
  }

  var scriptParams = {
    get: function (name) {
      return readQueryValue(script.src || "", name);
    },
  };

  if (!Array.prototype.find) {
    Array.prototype.find = function (predicate, thisArg) {
      for (var index = 0; index < this.length; index += 1) {
        if (predicate.call(thisArg, this[index], index, this)) return this[index];
      }
      return undefined;
    };
  }

  if (typeof Number.isFinite !== "function") {
    Number.isFinite = function (value) {
      return typeof value === "number" && isFinite(value);
    };
  }

  if (typeof Math.trunc !== "function") {
    Math.trunc = function (value) {
      value = Number(value);
      if (!isFinite(value)) return value;
      return value < 0 ? Math.ceil(value) : Math.floor(value);
    };
  }

  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        var matches =
          element.matches ||
          element.msMatchesSelector ||
          element.webkitMatchesSelector;
        if (matches && matches.call(element, selector)) return element;
        element = element.parentElement || element.parentNode;
      }
      return null;
    };
  }

  if (!window.Promise || !window.fetch) {
    if (window.console && console.warn) {
      console.warn("[Luup] Este navegador não possui recursos mínimos para carregar o widget.");
    }
    return;
  }

  function readScriptValue(attributeName, queryNames, fallback) {
    var attributeValue = script.getAttribute(attributeName);
    if (attributeValue !== null && attributeValue !== "") return attributeValue;
    for (var index = 0; index < queryNames.length; index += 1) {
      var queryValue = scriptParams.get(queryNames[index]);
      if (queryValue !== null && queryValue !== "") return queryValue;
    }
    return fallback;
  }

  var storeId = readScriptValue(
    "data-store-id",
    ["lupp_store_id", "store_id"],
    "",
  );
  var storeSlug = readScriptValue(
    "data-store",
    ["lupp_store", "lupp_store_slug", "store_slug"],
    "",
  );
  var widgetType = readScriptValue(
    "data-widget",
    ["lupp_widget", "widget"],
    "floating_launcher",
  ).replace(/-/g, "_");
  var nubesdkFrameMode = readScriptValue(
    "data-nubesdk-frame",
    ["lupp_nubesdk_frame"],
    "",
  );
  var configuredProductUrl = readScriptValue(
    "data-product-url",
    ["lupp_product_url", "product_url"],
    "",
  );
  var configuredProductId = readScriptValue(
    "data-product-id",
    [
      "lupp_product_id",
      "product_id",
      "external_product_id",
      "lupp_external_product_id",
    ],
    "",
  );
  var supabaseUrl = readScriptValue(
    "data-supabase-url",
    ["lupp_supabase_url", "supabase_url"],
    window.LUPP_SUPABASE_URL || "https://duktrvqfbvpfajuajhci.supabase.co",
  );
  var luppBaseUrl = readScriptValue(
    "data-lupp-url",
    ["lupp_url", "lupp_base_url"],
    getUrlOrigin(script.src || window.location.href),
  ).replace(/\/$/, "");
  var requireActiveWidget =
    readScriptValue(
      "data-require-active",
      ["lupp_require_active", "require_active"],
      "false",
    ) === "true";
  var externalStoreId = readScriptValue(
    "data-external-store-id",
    [
      "external_store_id",
      "lupp_external_store_id",
      "nuvemshop_store_id",
      "store",
    ],
    "",
  );
  var storeDomain = normalizedHostname(
    readScriptValue(
      "data-store-domain",
      ["store_domain", "lupp_store_domain", "domain", "hostname"],
      window.location.hostname || "",
    ),
  );
  var upzeroConfig = {};

  function inferNuvemshopStoreId() {
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

  function inferShopifyStoreId() {
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

  if (
    !supabaseUrl &&
    /apps-scripts\.tiendanube\.com/i.test(
      getUrlHostname(script.src || window.location.href),
    )
  ) {
    supabaseUrl = "https://duktrvqfbvpfajuajhci.supabase.co";
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
    !/^https?:\/\/(www\.)?(playluup\.com\.br|lupp-lupp\.vercel\.app)/i.test(
      luppBaseUrl,
    )
  ) {
    luppBaseUrl = "https://www.playluup.com.br";
  }

  var launcherConfig = {
    position: readScriptValue(
      "data-position",
      ["lupp_position"],
      "bottom-left",
    ),
    accentColor: readScriptValue(
      "data-accent-color",
      ["lupp_accent_color"],
      "#fe2c55",
    ),
    backgroundColor: readScriptValue(
      "data-background-color",
      ["lupp_background_color"],
      "#0b0b0f",
    ),
    textColor: readScriptValue(
      "data-text-color",
      ["lupp_text_color"],
      "#ffffff",
    ),
    label: readScriptValue("data-label", ["lupp_label"], "Compre pelo vídeo"),
    fontFamily: readScriptValue(
      "data-font-family",
      ["lupp_font_family"],
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    ),
    bubbleSize: Number(
      readScriptValue("data-bubble-size", ["lupp_bubble_size"], 74),
    ),
    model: readScriptValue("data-model", ["lupp_model"], "circular"),
    offsetX: Number(readScriptValue("data-offset-x", ["lupp_offset_x"], 18)),
    offsetY: Number(readScriptValue("data-offset-y", ["lupp_offset_y"], 18)),
  };

  var displayConfig = {
    mode: readScriptValue("data-display-mode", ["lupp_display_mode"], "all"),
    includePaths: parsePathList(
      readScriptValue("data-include-paths", ["lupp_include_paths"], ""),
    ),
    excludePaths: parsePathList(
      readScriptValue("data-exclude-paths", ["lupp_exclude_paths"], ""),
    ),
    productMode: readScriptValue(
      "data-product-mode",
      ["lupp_product_mode"],
      "linked_or_all",
    ),
    hideWithoutVideos:
      readScriptValue(
        "data-hide-without-videos",
        ["lupp_hide_without_videos"],
        "false",
      ) === "true",
    homeExperienceEnabled:
      readScriptValue(
        "data-home-experience-enabled",
        ["lupp_home_experience_enabled"],
        "true",
      ) !== "false",
  };
  var carouselConfig = {
    title: readScriptValue(
      "data-carousel-title",
      ["lupp_carousel_title"],
      "Descubra cada detalhe e Compre",
    ),
    description: readScriptValue(
      "data-carousel-description",
      ["lupp_carousel_description"],
      "",
    ),
    enabled:
      readScriptValue(
        "data-home-carousel-enabled",
        ["lupp_home_carousel_enabled"],
        "false",
      ) !== "false",
    beforeHeading: readScriptValue(
      "data-carousel-before-heading",
      ["lupp_carousel_before_heading"],
      "Com Capa",
    ),
    anchorSelector: readScriptValue(
      "data-carousel-anchor-selector",
      ["lupp_carousel_anchor_selector"],
      "",
    ),
    anchorPlacement: readScriptValue(
      "data-carousel-anchor-placement",
      ["lupp_carousel_anchor_placement"],
      "before",
    ),
    maxItems:
      Number(
        readScriptValue("data-carousel-max-items", ["lupp_carousel_max_items"], 12),
      ) || 12,
    mobileMaxItems:
      Number(
        readScriptValue(
          "data-carousel-mobile-max-items",
          ["lupp_carousel_mobile_max_items"],
          6,
        ),
      ) || 6,
  };
  var loadStrategy = readScriptValue(
    "data-load-strategy",
    ["lupp_load_strategy"],
    "idle",
  );
  var previewMode = readScriptValue(
    "data-preview-mode",
    ["lupp_preview_mode"],
    "balanced",
  );

  var canUseBootstrap =
    widgetType === "floating_launcher" ||
    widgetType === "floating_video" ||
    isCarouselWidget() ||
    Boolean(externalStoreId) ||
    Boolean(storeDomain);

  debugLog("config", {
    canUseBootstrap: canUseBootstrap,
    externalStoreId: externalStoreId,
    luppBaseUrl: luppBaseUrl,
    requireActiveWidget: requireActiveWidget,
    storeDomain: storeDomain,
    storeId: storeId,
    storeSlug: storeSlug,
    supabaseUrl: supabaseUrl,
    widgetType: widgetType,
  });

  if (
    (!storeId && !storeSlug && !externalStoreId && !storeDomain) ||
    !supabaseUrl ||
    !canUseBootstrap
  ) {
    debugLog("abort: initial gate", {
      hasStoreIdentity: Boolean(
        storeId || storeSlug || externalStoreId || storeDomain,
      ),
      hasSupabaseUrl: Boolean(supabaseUrl),
      keylessBootstrapAllowed: canUseBootstrap,
    });
    emitWidgetAborted("initial_gate");
    console.warn(
      "[Luup] Configure data-store-id, data-store ou data-store-domain para carregar o widget.",
    );
    return;
  }

  var bootstrapBase =
    supabaseUrl.replace(/\/$/, "") + "/functions/v1/lupp-widget-bootstrap";
  var upzeroProxyBase =
    supabaseUrl.replace(/\/$/, "") + "/functions/v1/upzero-storefront-proxy";

  function ensureVisitorId() {
    var key = "lupp_visitor_id";
    var current = localStorage.getItem(key);
    if (current) return current;
    var id = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(key, id);
    return id;
  }

  function ensureSessionId() {
    var key = "lupp_session_id";
    var current = sessionStorage.getItem(key);
    if (current) return current;
    var id = crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    sessionStorage.setItem(key, id);
    return id;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char];
    });
  }

  function fetchJson(path) {
    return fetch(apiBase + path, { headers: headers }).then(
      function (response) {
        if (!response.ok) throw new Error("Luup API error: " + response.status);
        return response.json();
      },
    );
  }

  function fetchBootstrap(mode) {
    var params = new URLSearchParams();
    var externalProvider =
      /\.myshopify\.com$/i.test(String(externalStoreId || ""))
        ? "shopify"
        : "nuvemshop";
    params.set("widget", mappedWidgetType());
    if (mode) params.set("mode", mode);
    if (storeId) params.set("store_id", storeId);
    if (storeSlug) params.set("store_slug", storeSlug);
    if (externalStoreId) {
      params.set("provider", externalProvider);
      params.set("external_store_id", externalStoreId);
    } else if (storeDomain) {
      params.set("provider", externalProvider);
      params.set("store_domain", storeDomain);
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
          hasWidgetConfig: Boolean(payload && payload.widget),
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

  function shouldUseBootstrap() {
    return canUseBootstrap;
  }

  function shouldAutoplayLauncherPreview() {
    return previewMode !== "performance";
  }

  function runAfterPageReady(callback) {
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
        window.setTimeout(run, 1);
      }, delay);
    }

    if (document.readyState === "complete") {
      scheduleIdle();
      return;
    }

    window.addEventListener("load", scheduleIdle, { once: true });
  }

  function isUpzeroStore(store) {
    return String((store && store.platform) || "").toLowerCase() === "upzero";
  }

  function normalizeCustomerStatus(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function isApprovedCustomerStatus(status) {
    var normalized = normalizeCustomerStatus(status);
    return normalized === "APPROVED" || normalized === "ACTIVE";
  }

  function readKnownUpzeroCustomer() {
    try {
      var candidates = [
        window.UPZERO_CLIENT,
        window.UPZERO_CUSTOMER,
        window.upzeroClient,
        window.upzeroCustomer,
      ];
      for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index];
        if (candidate && typeof candidate === "object") return candidate;
      }
    } catch (_) {}
    return null;
  }

  function parseJsonSafe(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function isLikelyJwt(value) {
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      String(value || "").trim(),
    );
  }

  function cleanBearerToken(value) {
    var token = String(value || "").trim();
    if (!token) return "";
    token = token.replace(/^Bearer\s+/i, "").trim();
    return token;
  }

  function tokenFromObject(value) {
    if (!value || typeof value !== "object") return "";
    var keys = [
      "clientAuthToken",
      "client_auth_token",
      "authToken",
      "accessToken",
      "access_token",
      "token",
      "jwt",
    ];
    for (var index = 0; index < keys.length; index += 1) {
      var token = cleanBearerToken(value[keys[index]]);
      if (token && isLikelyJwt(token)) return token;
    }
    for (var nestedKey in value) {
      if (!Object.prototype.hasOwnProperty.call(value, nestedKey)) continue;
      if (typeof value[nestedKey] === "object") {
        var nestedToken = tokenFromObject(value[nestedKey]);
        if (nestedToken) return nestedToken;
      }
    }
    return "";
  }

  function readStorageToken(storage) {
    if (!storage) return "";
    var preferredKeys = [
      "clientAuthToken",
      "client_auth_token",
      "upzero_client_auth_token",
      "upzeroClientAuthToken",
      "upzero.clientAuthToken",
      "upzero.auth.token",
      "upzero_auth_token",
      "authToken",
      "accessToken",
      "access_token",
      "token",
    ];

    try {
      for (var index = 0; index < preferredKeys.length; index += 1) {
        var directValue = storage.getItem(preferredKeys[index]);
        var directToken = cleanBearerToken(directValue);
        if (directToken && isLikelyJwt(directToken)) return directToken;

        var parsedDirect = parseJsonSafe(directValue);
        var parsedDirectToken = tokenFromObject(parsedDirect);
        if (parsedDirectToken) return parsedDirectToken;
      }

      for (var itemIndex = 0; itemIndex < storage.length; itemIndex += 1) {
        var key = storage.key(itemIndex);
        if (!key) continue;
        var lowerKey = key.toLowerCase();
        if (
          lowerKey.indexOf("auth") === -1 &&
          lowerKey.indexOf("token") === -1 &&
          lowerKey.indexOf("client") === -1 &&
          lowerKey.indexOf("customer") === -1 &&
          lowerKey.indexOf("upzero") === -1
        ) {
          continue;
        }

        var value = storage.getItem(key);
        var token = cleanBearerToken(value);
        if (token && isLikelyJwt(token)) return token;

        var parsed = parseJsonSafe(value);
        var parsedToken = tokenFromObject(parsed);
        if (parsedToken) return parsedToken;
      }
    } catch (_) {}
    return "";
  }

  function readCookieToken() {
    try {
      var cookies = document.cookie ? document.cookie.split(";") : [];
      for (var index = 0; index < cookies.length; index += 1) {
        var cookie = cookies[index].trim();
        var separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) continue;
        var name = cookie.slice(0, separatorIndex).trim().toLowerCase();
        var value = decodeURIComponent(cookie.slice(separatorIndex + 1));
        if (
          name !== "clientauthtoken" &&
          name !== "client_auth_token" &&
          name.indexOf("authtoken") === -1 &&
          name.indexOf("auth_token") === -1
        ) {
          continue;
        }
        var token = cleanBearerToken(value);
        if (token && isLikelyJwt(token)) return token;
      }
    } catch (_) {}
    return "";
  }

  function readUpzeroAuthToken() {
    var knownCustomer = readKnownUpzeroCustomer();
    var knownToken = tokenFromObject(knownCustomer);
    if (knownToken) return knownToken;

    var localToken = readStorageToken(window.localStorage);
    if (localToken) return localToken;

    var sessionToken = readStorageToken(window.sessionStorage);
    if (sessionToken) return sessionToken;

    return readCookieToken();
  }

  function decodeBase64Url(value) {
    try {
      var normalized = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      while (normalized.length % 4) normalized += "=";
      return decodeURIComponent(
        Array.prototype.map
          .call(window.atob(normalized), function (char) {
            return "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2);
          })
          .join(""),
      );
    } catch (_) {
      return "";
    }
  }

  function decodeJwtPayload(token) {
    try {
      var payload = String(token || "").split(".")[1];
      if (!payload) return null;
      return parseJsonSafe(decodeBase64Url(payload));
    } catch (_) {
      return null;
    }
  }

  function statusFromToken(token) {
    var payload = decodeJwtPayload(token);
    if (!payload || typeof payload !== "object") return "";
    return normalizeCustomerStatus(
      payload.status ||
        payload.client_status ||
        payload.customer_status ||
        payload.account_status ||
        "",
    );
  }

  function pageTextWithoutLuppWidgets() {
    var body = document.body;
    if (!body) return "";
    if (!body.querySelector("[data-lupp-widget-root],[data-lupp-feed-overlay]")) {
      return String(body.innerText || "");
    }
    var clone = body.cloneNode(true);
    var ownNodes = clone.querySelectorAll(
      "[data-lupp-widget-root],[data-lupp-feed-overlay],script,style",
    );
    for (var index = 0; index < ownNodes.length; index += 1) {
      if (ownNodes[index].parentNode) {
        ownNodes[index].parentNode.removeChild(ownNodes[index]);
      }
    }
    return String(clone.textContent || "");
  }

  function inferUpzeroCustomerStatusFromPage() {
    try {
      // Widget-rendered copy ("Entre ou cadastre-se para visualizar valores")
      // must not feed this inference, or render -> infer -> re-render loops.
      var text = pageTextWithoutLuppWidgets()
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (!text) return null;

      var showsAccount =
        text.indexOf("minha conta") > -1 ||
        text.indexOf("minhas compras") > -1 ||
        text.indexOf("meus pedidos") > -1 ||
        text.indexOf("meus dados") > -1 ||
        text.indexOf("olá,") > -1 ||
        text.indexOf("sair") > -1 ||
        text.indexOf("logout") > -1;
      var asksForLogin =
        text.indexOf("cadastre-se para ver") > -1 ||
        text.indexOf("faça login para ver") > -1 ||
        text.indexOf("entre para ver") > -1 ||
        text.indexOf("entre ou cadastre-se") > -1 ||
        text.indexOf("visualizar valores") > -1;

      if (asksForLogin && !showsAccount) {
        return {
          approved: false,
          loggedIn: false,
          source: "page",
          status: "UNAUTHENTICATED",
        };
      }

      if (showsAccount) {
        return {
          approved: true,
          loggedIn: true,
          source: "page",
          status: "ACTIVE",
        };
      }
    } catch (_) {}
    return null;
  }

  var upzeroCustomerStatusCache = null;
  var upzeroCustomerStatusLastRefreshAt = 0;

  function isLoggedOutUpzeroStatus(status) {
    return (
      status &&
      (status.loggedIn === false ||
        normalizeCustomerStatus(status.status) === "UNAUTHENTICATED")
    );
  }

  function upzeroProxyHeaders() {
    var headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    var authToken = readUpzeroAuthToken();
    if (authToken) headers.Authorization = "Bearer " + authToken;
    return headers;
  }

  function upzeroProxyRequest(action, body, signal) {
    if (!activeStore || !activeStore.id) {
      return Promise.reject(new Error("upzero_store_not_ready"));
    }
    var payload = body && typeof body === "object" ? body : {};
    payload.action = action;
    payload.store_id = activeStore.id;

    return fetch(upzeroProxyBase, {
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      headers: upzeroProxyHeaders(),
      method: "POST",
      signal: signal,
    });
  }

  function detectUpzeroCustomerStatus(store, options) {
    var forceRefresh = Boolean(options && options.forceRefresh);
    if (!isUpzeroStore(store)) {
      return Promise.resolve({
        approved: true,
        loggedIn: true,
        source: "not_upzero",
        status: "not_applicable",
      });
    }

    var inferredCustomer = inferUpzeroCustomerStatusFromPage();
    if (isLoggedOutUpzeroStatus(inferredCustomer)) {
      upzeroCustomerStatusCache = inferredCustomer;
      upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(upzeroCustomerStatusCache);
    }

    if (upzeroCustomerStatusCache && !forceRefresh) {
      return Promise.resolve(upzeroCustomerStatusCache);
    }

    if (inferredCustomer && inferredCustomer.approved) {
      upzeroCustomerStatusCache = inferredCustomer;
      upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(upzeroCustomerStatusCache);
    }

    var knownCustomer = readKnownUpzeroCustomer();
    if (
      knownCustomer &&
      (!forceRefresh || isApprovedCustomerStatus(knownCustomer.status))
    ) {
      upzeroCustomerStatusCache = {
        approved: isApprovedCustomerStatus(knownCustomer.status),
        loggedIn: true,
        source: "window",
        status: normalizeCustomerStatus(knownCustomer.status || "UNKNOWN"),
      };
      upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(upzeroCustomerStatusCache);
    }

    if (inferredCustomer) {
      upzeroCustomerStatusCache = inferredCustomer;
      upzeroCustomerStatusLastRefreshAt = Date.now();
      return Promise.resolve(upzeroCustomerStatusCache);
    }

    function fetchUpzeroCustomerStatus(authToken) {
      var controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      var timeout = window.setTimeout(function () {
        if (controller) controller.abort();
      }, 4000);

      return upzeroProxyRequest(
        "customer_status",
        {},
        controller ? controller.signal : undefined,
      )
        .then(function (response) {
          window.clearTimeout(timeout);
          if (response.status === 401) {
            return {
              approved: false,
              loggedIn: false,
              source: authToken ? "bearer_proxy" : "storefront_proxy",
              status: "UNAUTHENTICATED",
            };
          }
          if (!response.ok) throw new Error("upzero_client_status_unavailable");
          return response.json().then(function (payload) {
            var client =
              payload && payload.data && typeof payload.data === "object"
                ? payload.data
                : payload;
            var status = normalizeCustomerStatus(client && client.status);
            return {
              approved: isApprovedCustomerStatus(status),
              loggedIn: true,
              source: authToken ? "bearer_proxy" : "storefront_proxy",
              status: status || "UNKNOWN",
            };
          });
        })
        .catch(function (error) {
          window.clearTimeout(timeout);
          throw error;
        });
    }

    var authToken = readUpzeroAuthToken();
    var tokenStatus = statusFromToken(authToken);
    var request = authToken
      ? fetchUpzeroCustomerStatus(authToken)
          .then(function (status) {
            if (status.loggedIn || status.approved) return status;
            return fetchUpzeroCustomerStatus("");
          })
          .catch(function () {
            return fetchUpzeroCustomerStatus("");
          })
      : fetchUpzeroCustomerStatus("");

    return request
      .catch(function () {
        var latestInferredCustomer = inferUpzeroCustomerStatusFromPage();
        if (latestInferredCustomer) return latestInferredCustomer;
        if (authToken && tokenStatus && isApprovedCustomerStatus(tokenStatus)) {
          return {
            approved: true,
            loggedIn: true,
            source: "token",
            status: tokenStatus,
          };
        }
        return {
          approved: false,
          loggedIn: false,
          source: authToken ? "bearer_fallback" : "fallback",
          status: "UNKNOWN",
        };
      })
      .then(function (status) {
        upzeroCustomerStatusCache = status;
        upzeroCustomerStatusLastRefreshAt = Date.now();
        return status;
      });
  }

  function isTrustedLuppFrameOrigin(origin) {
    try {
      var normalizedOrigin = getUrlOrigin(origin);
      var configuredOrigin = getUrlOrigin(resolveUrl(luppBaseUrl, window.location.href));
      var scriptOrigin = getUrlOrigin(script.src || "");
      if (normalizedOrigin === configuredOrigin || normalizedOrigin === scriptOrigin) {
        return true;
      }
      var hostname = getUrlHostname(normalizedOrigin);
      return (
        sameStorefrontHostname(hostname, "playluup.com.br") ||
        sameStorefrontHostname(hostname, "www.playluup.com.br") ||
        /(^|\.)vercel\.app$/i.test(hostname)
      );
    } catch (_) {
      return false;
    }
  }

  function postUpzeroCustomerStatus(target, origin, status) {
    if (!target || typeof target.postMessage !== "function") return;
    target.postMessage(
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

  function postUpzeroCartResponse(target, origin, requestId, payload) {
    if (!target || typeof target.postMessage !== "function") return;
    target.postMessage(
      {
        type: "LUPP_UPZERO_ADD_TO_CART_RESPONSE",
        requestId: requestId,
        ok: Boolean(payload && payload.ok),
        error: payload && payload.error ? String(payload.error) : "",
      },
      origin,
    );
  }

  function postNuvemshopCartResponse(target, origin, requestId, payload) {
    if (!target || typeof target.postMessage !== "function") return;
    target.postMessage(
      {
        type: "LUPP_NUVEMSHOP_ADD_TO_CART_RESPONSE",
        requestId: requestId,
        ok: Boolean(payload && payload.ok),
        error: payload && payload.error ? String(payload.error) : "",
      },
      origin,
    );
  }

  function postShopifyCartResponse(target, origin, requestId, payload) {
    if (!target || typeof target.postMessage !== "function") return;
    target.postMessage(
      {
        type: "LUPP_SHOPIFY_ADD_TO_CART_RESPONSE",
        requestId: requestId,
        ok: Boolean(payload && payload.ok),
        error: payload && payload.error ? String(payload.error) : "",
      },
      origin,
    );
  }

  function postShopifyProductResponse(target, origin, requestId, payload) {
    if (!target || typeof target.postMessage !== "function") return;
    target.postMessage(
      {
        type: "LUPP_SHOPIFY_PRODUCT_RESPONSE",
        requestId: requestId,
        ok: Boolean(payload && payload.ok),
        error: payload && payload.error ? String(payload.error) : "",
        product: payload && payload.product ? payload.product : null,
      },
      origin,
    );
  }

  function parseUpzeroServerActionResult(text) {
    function findResult(value, depth) {
      if (!value || depth > 4) return null;
      if (
        typeof value === "object" &&
        ("ok" in value || "cart" in value || "error" in value)
      ) {
        return value;
      }
      if (Array.isArray(value)) {
        for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
          var arrayResult = findResult(value[arrayIndex], depth + 1);
          if (arrayResult) return arrayResult;
        }
        return null;
      }
      if (typeof value === "object") {
        for (var key in value) {
          if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
          var objectResult = findResult(value[key], depth + 1);
          if (objectResult) return objectResult;
        }
      }
      return null;
    }

    var lines = String(text || "").split(/\n/);
    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index];
      if (!line) continue;
      var separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) continue;
      try {
        var payload = JSON.parse(line.slice(separatorIndex + 1));
        var result = findResult(payload, 0);
        if (result) return result;
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  var upzeroCartActionCache = null;

  function isRecoverableUpzeroCartError(error) {
    var message = String((error && error.message) || error || "");
    return /server action not found|failed to find server action|upzero_cart_action_not_found|upzero_product_page_unavailable|upzero_cart_request_failed|failed to fetch|networkerror|load failed|cors/i.test(
      message,
    );
  }

  function normalizeUpzeroActionUrl(url) {
    var fallback =
      (upzeroConfig && upzeroConfig.storefront_url) ||
      (activeStore && activeStore.url) ||
      window.location.href;
    var resolved = url || fallback;
    try {
      resolved = resolveUrl(resolved, fallback);
      if (typeof URL !== "undefined") {
        var parsed = new URL(resolved, window.location.href);
        var current = new URL(window.location.href);
        var isUpzeroProductPath =
          isUpzeroStore(activeStore) && /\/produtos\//i.test(parsed.pathname);
        if (
          (isUpzeroProductPath ||
            sameStorefrontHostname(parsed.hostname, current.hostname)) &&
          (parsed.hostname !== current.hostname ||
            parsed.protocol !== current.protocol ||
            parsed.port !== current.port)
        ) {
          parsed.protocol = current.protocol;
          parsed.hostname = current.hostname;
          parsed.port = current.port;
          return parsed.href;
        }
      }
      return resolved;
    } catch (_) {
      return resolved;
    }
  }

  function extractUpzeroCartActionIds(text) {
    var source = String(text || "");
    var matches = [];
    var seen = {};
    var patterns = [
      /createServerReference\(["']([a-f0-9]{40})["'][^)]*["']addStorefrontCartItemsBatchAction["']/gi,
      /"([a-f0-9]{40})"(?=[^]{0,900}(?:cart|carrinho|sessionId|productVariantId|storeId|items))/gi,
      /(?:cart|carrinho|sessionId|productVariantId|storeId|items)[^]{0,900}"([a-f0-9]{40})"/gi,
      /Next-Action["']?\s*[:=]\s*["']([a-f0-9]{40})["']/gi,
    ];

    patterns.forEach(function (pattern) {
      var match;
      while ((match = pattern.exec(source))) {
        var id = String(match[1] || "").toLowerCase();
        if (id && !seen[id]) {
          seen[id] = true;
          matches.push(id);
        }
      }
    });

    return matches;
  }

  function findUpzeroStoreIdInObject(value, depth) {
    if (!value || typeof value !== "object" || depth > 8) return null;

    var directKeys = [
      "storefrontStoreId",
      "storefront_store_id",
      "storeId",
      "store_id",
      "upzeroStoreId",
      "upzero_store_id",
    ];

    for (var index = 0; index < directKeys.length; index += 1) {
      var directValue = Number(value[directKeys[index]]);
      if (Number.isFinite(directValue) && directValue > 0) {
        return Math.trunc(directValue);
      }
    }

    var nestedStore = value.store || value.storefront || value.storefrontStore;
    if (nestedStore && typeof nestedStore === "object") {
      var nestedId = Number(nestedStore.id || nestedStore.storeId);
      if (Number.isFinite(nestedId) && nestedId > 0) return Math.trunc(nestedId);
    }

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var child = value[key];
      if (!child || typeof child !== "object") continue;
      var found = findUpzeroStoreIdInObject(child, depth + 1);
      if (found) return found;
    }

    return null;
  }

  function extractUpzeroStorefrontStoreIdFromJsonText(text) {
    var source = String(text || "");
    var snippets = [];
    source.replace(
      /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
      function (_, json) {
        if (json) snippets.push(json);
        return "";
      },
    );

    if (
      !snippets.length &&
      /^[\s\r\n]*[\[{]/.test(source) &&
      source.length < 250000
    ) {
      snippets.push(source);
    }

    for (var index = 0; index < snippets.length; index += 1) {
      try {
        var parsed = JSON.parse(snippets[index]);
        var storeId = findUpzeroStoreIdInObject(parsed, 0);
        if (storeId) return storeId;
      } catch (_) {}
    }

    return null;
  }

  function extractUpzeroStorefrontStoreIdFromText(text) {
    var source = String(text || "");
    var patterns = [
      /"storeId"\s*:\s*(\d+)/,
      /"store_id"\s*:\s*(\d+)/,
      /"storefrontStoreId"\s*:\s*(\d+)/,
      /"storefront_store_id"\s*:\s*(\d+)/,
      /"store"\s*:\s*\{[^}]{0,1200}"id"\s*:\s*(\d+)/,
      /storeId\\?":(\d+)/,
      /store_id\\?":(\d+)/,
      /storefrontStoreId\\?":(\d+)/,
      /storefront_store_id\\?":(\d+)/,
      /storeId&quot;:\s*(\d+)/,
      /store_id&quot;:\s*(\d+)/,
      /storefront_store_id&quot;:\s*(\d+)/,
    ];

    for (var index = 0; index < patterns.length; index += 1) {
      var match = source.match(patterns[index]);
      var value = Number(match && match[1]);
      if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    }

    return extractUpzeroStorefrontStoreIdFromJsonText(source);
  }

  function readUpzeroStorefrontStoreIdFromWindow() {
    var globals = [
      window.__NEXT_DATA__,
      window.__UPZERO_DATA__,
      window.__STORE__,
      window.__STORE_DATA__,
    ];

    for (var index = 0; index < globals.length; index += 1) {
      var storeId = findUpzeroStoreIdInObject(globals[index], 0);
      if (storeId) return storeId;
    }

    return null;
  }

  function extractScriptSourcesFromHtml(html, pageUrl) {
    var sources = [];
    var seen = {};
    String(html || "").replace(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
      function (_, src) {
        try {
          var resolved = resolveUrl(src, pageUrl);
          if (!seen[resolved]) {
            seen[resolved] = true;
            sources.push(resolved);
          }
        } catch (_) {}
        return "";
      },
    );
    return sources;
  }

  function extractScriptSourcesFromDocument(pageUrl) {
    var sources = [];
    var seen = {};
    try {
      var scripts = document.getElementsByTagName("script");
      for (var index = 0; index < scripts.length; index += 1) {
        var src = scripts[index].getAttribute("src");
        if (!src) continue;
        var resolved = resolveUrl(src, pageUrl || window.location.href);
        if (!seen[resolved]) {
          seen[resolved] = true;
          sources.push(resolved);
        }
      }
    } catch (_) {}
    return sources;
  }

  function readUpzeroCartContextFromDocument(pageUrl) {
    var source = "";
    var scriptSources = extractScriptSourcesFromDocument(pageUrl);
    try {
      var scripts = document.getElementsByTagName("script");
      for (var index = 0; index < scripts.length; index += 1) {
        if (scripts[index].getAttribute("src")) continue;
        source += "\n" + String(scripts[index].textContent || "").slice(0, 60000);
      }
    } catch (_) {}

    var actionIds = extractUpzeroCartActionIds(source);
    var storeId = extractUpzeroStorefrontStoreIdFromText(source);
    if (!actionIds.length && !storeId && !scriptSources.length) return null;
    return {
      actionIds: actionIds,
      actionId: actionIds[0] || "",
      scriptSources: scriptSources,
      storeId: storeId || null,
    };
  }

  function discoverUpzeroCartContext(actionUrl) {
    var targetUrl = normalizeUpzeroActionUrl(actionUrl);
    if (
      upzeroCartActionCache &&
      upzeroCartActionCache.url === targetUrl &&
      upzeroCartActionCache.actionId
    ) {
      return Promise.resolve(upzeroCartActionCache);
    }

    var documentContext = readUpzeroCartContextFromDocument(targetUrl);

    return fetch(targetUrl, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "text/html,application/xhtml+xml" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("upzero_product_page_unavailable");
        return response.text();
      })
      .then(function (html) {
        var storeId = extractUpzeroStorefrontStoreIdFromText(html);
        var directIds = extractUpzeroCartActionIds(html);
        if (directIds.length) {
          upzeroCartActionCache = {
            actionId: directIds[0],
            actionIds: directIds,
            storeId: storeId || null,
            url: targetUrl,
          };
          return upzeroCartActionCache;
        }

        var scriptSources = extractScriptSourcesFromHtml(html, targetUrl)
          .concat((documentContext && documentContext.scriptSources) || []);
        var seenScriptSources = {};
        scriptSources = scriptSources
          .filter(function (src) {
            if (!/\/_next\/static\//.test(src) || seenScriptSources[src]) return false;
            seenScriptSources[src] = true;
            return true;
          })
          .slice(0, 24);

        var chain = Promise.resolve({
          actionIds: (documentContext && documentContext.actionIds) || [],
          storeId: storeId || (documentContext && documentContext.storeId) || null,
        });
        scriptSources.forEach(function (src) {
          chain = chain.then(function (context) {
            if (context.actionIds.length && context.storeId) return context;
            return fetch(src, {
              cache: "force-cache",
              credentials: "omit",
            })
              .then(function (response) {
                return response.ok ? response.text() : "";
              })
              .then(function (scriptText) {
                return {
                  actionIds:
                    context.actionIds.length
                      ? context.actionIds
                      : extractUpzeroCartActionIds(scriptText),
                  storeId:
                    context.storeId ||
                    extractUpzeroStorefrontStoreIdFromText(scriptText),
                };
              })
              .catch(function () {
                return context;
              });
          });
        });

        return chain.then(function (context) {
          var actionId = (context.actionIds[0] || "").toLowerCase();
          if (!actionId) {
            throw new Error("upzero_cart_action_not_found");
          }
          upzeroCartActionCache = {
            actionId: actionId,
            actionIds: context.actionIds,
            storeId: context.storeId || null,
            url: targetUrl,
          };
          return upzeroCartActionCache;
        });
      });
  }

  function discoverUpzeroCartAction(actionUrl) {
    return discoverUpzeroCartContext(actionUrl).then(function (context) {
      return context.actionId;
    });
  }

  function inferUpzeroStorefrontStoreId() {
    var candidates = [
      upzeroConfig && upzeroConfig.storefront_store_id,
      upzeroConfig && upzeroConfig.store_id,
      upzeroConfig && upzeroConfig.upzero_store_id,
      externalStoreId,
      activeStore && activeStore.external_store_id,
      activeStore && activeStore.storefront_store_id,
      activeStore && activeStore.upzero_store_id,
      activeStore && activeStore.settings && activeStore.settings.store_id,
      readUpzeroStorefrontStoreIdFromWindow(),
      window.UPZERO_STORE_ID,
      window.__UPZERO_STORE_ID__,
      window.storeId,
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      var value = Number(candidates[index]);
      if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    }

    try {
      var storageKey = Object.keys(window.localStorage || {}).find(function (
        key,
      ) {
        return /^storefront_cart_session_\d+$/.test(key);
      });
      var storageMatch = storageKey && storageKey.match(/_(\d+)$/);
      if (storageMatch) return Number(storageMatch[1]);
    } catch (_) {}

    try {
      var html = document.documentElement.innerHTML || "";
      var extractedStoreId = extractUpzeroStorefrontStoreIdFromText(html);
      if (extractedStoreId) return extractedStoreId;
    } catch (_) {}

    try {
      var pathMatch = window.location.pathname.match(/^\/(\d+)(?:\/|$)/);
      if (pathMatch) return Number(pathMatch[1]);
    } catch (_) {}

    return null;
  }

  function upzeroCartSessionKey(storefrontStoreId) {
    return "storefront_cart_session_" + storefrontStoreId;
  }

  function getUpzeroCartQuantity(cart, fallbackItems) {
    var directCandidates = [
      cart && cart.total_quantity,
      cart && cart.totalQuantity,
      cart && cart.items_count,
      cart && cart.itemsCount,
      cart && cart.total_items,
      cart && cart.totalItems,
      cart && cart.quantity,
    ];

    for (var index = 0; index < directCandidates.length; index += 1) {
      var directValue = Number(directCandidates[index]);
      if (Number.isFinite(directValue) && directValue >= 0) {
        return Math.trunc(directValue);
      }
    }

    var items =
      (cart && Array.isArray(cart.items) && cart.items) ||
      (cart && Array.isArray(cart.cart_items) && cart.cart_items) ||
      (cart && Array.isArray(cart.lines) && cart.lines) ||
      (Array.isArray(fallbackItems) && fallbackItems) ||
      [];

    return items.reduce(function (total, item) {
      var quantity = Number(
        (item && item.quantity) || (item && item.qty) || (item && item.amount),
      );
      return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
    }, 0);
  }

  function formatUpzeroCartCount(quantity) {
    return quantity === 1 ? "1 PC." : quantity + " PCS.";
  }

  function updateUpzeroCartCounters(quantity) {
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

  function emitCartEvent(eventName, detail) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    } catch (_) {}
  }

  function persistUpzeroCartSession(sessionId, storefrontStoreId) {
    var normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) return;

    try {
      window.localStorage.setItem(
        upzeroCartSessionKey(storefrontStoreId),
        normalizedSessionId,
      );
    } catch (_) {}

    try {
      var encoded = encodeURIComponent(normalizedSessionId);
      var maxAge = 60 * 60 * 24 * 30;
      document.cookie =
        "sessionID=" +
        encoded +
        "; path=/; max-age=" +
        maxAge +
        "; SameSite=Lax; Secure";
      document.cookie =
        upzeroCartSessionKey(storefrontStoreId) +
        "=" +
        encoded +
        "; path=/; max-age=" +
        maxAge +
        "; SameSite=Lax; Secure";
    } catch (_) {}
  }

  function notifyUpzeroCartUpdated(cart, storefrontStoreId, fallbackItems) {
    if (cart && cart.session_id) {
      persistUpzeroCartSession(cart.session_id, storefrontStoreId);
    }

    var quantity = getUpzeroCartQuantity(cart, fallbackItems);
    var detail = {
      cart: cart || null,
      items: Array.isArray(fallbackItems) ? fallbackItems : [],
      quantity: quantity,
      storeId: storefrontStoreId,
    };
    var eventNames = [
      "luup:upzero-cart-updated",
      "luup:cart-updated",
      "upzero:cart:updated",
      "upzero:cart-updated",
      "storefront:cart:updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart-updated",
      "cart:refresh",
      "cart-refresh",
    ];

    eventNames.forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: upzeroCartSessionKey(storefrontStoreId),
          newValue:
            cart && cart.session_id ? String(cart.session_id) : null,
          storageArea: window.localStorage,
          url: window.location.href,
        }),
      );
    } catch (_) {
      try {
        window.dispatchEvent(new Event("storage"));
      } catch (__) {}
    }

    updateUpzeroCartCounters(quantity);
    pendingStorefrontCartRefresh = true;
    pendingStorefrontCartDetail = detail;
  }

  function addUpzeroItemsToCartApi(items, storefrontStoreId, sessionId) {
    var snakeItems = items.map(function (item) {
      var payload = {
        product_variant_id: item.productVariantId,
        quantity: item.quantity,
      };
      if (item.assetId) payload.asset_id = item.assetId;
      return payload;
    });
    var camelItems = items.map(function (item) {
      var payload = {
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      };
      if (item.assetId) payload.assetId = item.assetId;
      return payload;
    });
    var payloads = [
      {
        items: snakeItems,
        session_id: sessionId || null,
        store_id: storefrontStoreId,
        type: "IN",
      },
      {
        items: camelItems,
        sessionId: sessionId || null,
        storeId: storefrontStoreId,
        type: "IN",
      },
      {
        cart_items: snakeItems,
        session_id: sessionId || null,
        store_id: storefrontStoreId,
        type: "IN",
      },
    ];

    function postPayload(payload) {
      return upzeroProxyRequest("cart_batch", {
        payloads: [payload],
        session_id: sessionId || null,
        storefront_store_id: storefrontStoreId,
      }).then(function (response) {
        return response
          .text()
          .catch(function () {
            return "";
          })
          .then(function (text) {
            var parsedPayload = null;
            try {
              parsedPayload = text ? JSON.parse(text) : null;
            } catch (_) {}
            if (!response.ok) {
              var apiMessage =
                (parsedPayload &&
                  (parsedPayload.message || parsedPayload.error)) ||
                (text && text.length < 200 ? text : "upzero_cart_api_failed");
              throw new Error(apiMessage);
            }
            var cart =
              (parsedPayload && parsedPayload.cart) ||
              (parsedPayload && parsedPayload.data) ||
              parsedPayload ||
              null;
            notifyUpzeroCartUpdated(cart, storefrontStoreId, items);
            return parsedPayload || {};
          });
      });
    }

    function tryPayload(index, lastError) {
      if (index >= payloads.length) {
        throw lastError || new Error("upzero_cart_api_failed");
      }

      return postPayload(payloads[index]).catch(function (error) {
        return tryPayload(index + 1, error);
      });
    }

    return tryPayload(0, null);
  }

  function flushPendingStorefrontCartRefresh() {
    if (!pendingStorefrontCartRefresh) return;
    var detail = pendingStorefrontCartDetail || {};
    pendingStorefrontCartRefresh = false;
    pendingStorefrontCartDetail = null;

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

  function isNuvemshopStore(store) {
    var platform = String((store && store.platform) || "").toLowerCase();
    return (
      platform === "nuvemshop" ||
      (!platform &&
        Boolean(externalStoreId) &&
        !/\.myshopify\.com$/i.test(String(externalStoreId || "")))
    );
  }

  function isShopifyStore(store) {
    return String((store && store.platform) || "").toLowerCase() === "shopify";
  }

  function notifyNuvemshopCartUpdated(items) {
    var quantity = (items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    var detail = {
      items: items || [],
      provider: "nuvemshop",
      quantity: quantity,
      source: "luup",
    };

    [
      "luup:nuvemshop-cart-updated",
      "luup:cart-updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart:refresh",
    ].forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    updateNuvemshopCartCounters(quantity);
    pendingStorefrontCartRefresh = true;
    pendingStorefrontCartDetail = detail;
  }

  function updateNuvemshopCartCounters(quantity) {
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

  function updateShopifyCartCounters(quantity) {
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

  function notifyShopifyCartUpdated(items, cart) {
    var quantity = (items || []).reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    var detail = {
      cart: cart || null,
      items: items || [],
      provider: "shopify",
      quantity: quantity,
      source: "luup",
    };

    [
      "luup:shopify-cart-updated",
      "luup:cart-updated",
      "storefront:cart-updated",
      "cart:updated",
      "cart:refresh",
      "theme:cart:change",
    ].forEach(function (eventName) {
      emitCartEvent(eventName, detail);
    });

    updateShopifyCartCounters(quantity);
    pendingStorefrontCartRefresh = true;
    pendingStorefrontCartDetail = detail;
  }

  function getNuvemshopCartBridge() {
    return (
      window.__LUUP_NUVEMSHOP_ADD_TO_CART__ ||
      (window.LuupNuvemshopCart && window.LuupNuvemshopCart.addItems)
    );
  }

  function waitForNuvemshopCartBridge(deadline) {
    var bridge = getNuvemshopCartBridge();
    if (typeof bridge === "function") return Promise.resolve(bridge);
    if (Date.now() >= deadline) {
      return Promise.reject(new Error("nuvemshop_cart_bridge_not_ready"));
    }
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        waitForNuvemshopCartBridge(deadline).then(resolve).catch(reject);
      }, 120);
    });
  }

  function postNativeNuvemshopCartItem(item) {
    if (!window.fetch || !window.URLSearchParams) {
      return Promise.reject(new Error("nuvemshop_cart_bridge_not_ready"));
    }

    var body = new URLSearchParams();
    body.set("add_to_cart", String(item.product_id));
    body.set("quantity", String(item.quantity));
    body.set("variant_id", String(item.variant_id));

    return fetch("/comprar/", {
      body: body.toString(),
      cache: "no-store",
      credentials: "include",
      headers: {
        Accept: "text/html,application/json,*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      method: "POST",
      redirect: "follow",
    }).then(function (response) {
      if (response.ok || response.redirected) return {};
      return response
        .text()
        .catch(function () {
          return "";
        })
        .then(function (text) {
          throw new Error(
            text && text.length < 160 ? text : "nuvemshop_native_cart_failed",
          );
        });
    });
  }

  function addNuvemshopItemsWithNativeCart(validItems) {
    return validItems.reduce(function (promise, item) {
      return promise.then(function () {
        return postNativeNuvemshopCartItem(item);
      });
    }, Promise.resolve()).then(function () {
      return { method: "native_form_post" };
    });
  }

  function addNuvemshopItemsToCart(items) {
    if (!isNuvemshopStore(activeStore)) {
      return Promise.reject(new Error("nuvemshop_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var productId = Number(item && item.product_id);
        var variantId = Number(item && item.variant_id);
        var quantity = Number(item && item.quantity);
        if (
          !Number.isFinite(productId) ||
          !Number.isFinite(variantId) ||
          !Number.isFinite(quantity)
        ) {
          return null;
        }
        if (productId <= 0 || variantId <= 0 || quantity <= 0) return null;
        return {
          product_id: Math.trunc(productId),
          quantity: Math.trunc(quantity),
          variant_id: Math.trunc(variantId),
        };
      })
      .filter(Boolean);

    if (!validItems.length) {
      return Promise.reject(new Error("empty_cart_items"));
    }

    return waitForNuvemshopCartBridge(Date.now() + 6000)
      .then(function (bridge) {
        return Promise.resolve(bridge(validItems)).then(function (result) {
          notifyNuvemshopCartUpdated(validItems);
          return result || {};
        });
      })
      .catch(function (bridgeError) {
        return addNuvemshopItemsWithNativeCart(validItems)
          .then(function (result) {
            notifyNuvemshopCartUpdated(validItems);
            return result || {};
          })
          .catch(function () {
            throw bridgeError;
          });
      });
  }

  function shopifyProductJsonUrl(productUrl) {
    var resolved = resolveUrl(productUrl || window.location.href, window.location.href);
    var anchor = createAnchor(resolved);
    var path = String(anchor.pathname || "");
    var match = path.match(/\/products\/([^/?#]+)/i);
    if (!match) return "";
    return "/products/" + encodeURIComponent(decodeURIComponent(match[1])) + ".js";
  }

  function addShopifyProductJsonCandidate(candidates, productUrl) {
    var jsonUrl = shopifyProductJsonUrl(productUrl);
    if (!jsonUrl || candidates.indexOf(jsonUrl) !== -1) return;
    candidates.push(jsonUrl);
  }

  function shopifyProductJsonCandidates(productUrl) {
    var candidates = [];
    addShopifyProductJsonCandidate(candidates, productUrl);
    try {
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        addShopifyProductJsonCandidate(candidates, canonical.href);
      }
    } catch (_) {}
    addShopifyProductJsonCandidate(candidates, window.location.href);
    return candidates;
  }

  function fetchShopifyProductJson(productUrl) {
    var candidates = shopifyProductJsonCandidates(productUrl);
    if (!candidates.length) {
      return Promise.reject(new Error("shopify_variant_not_found"));
    }

    function tryCandidate(index, lastError) {
      if (index >= candidates.length) {
        throw lastError || new Error("shopify_product_json_failed");
      }

      return fetch(candidates[index], {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then(function (response) {
          if (!response.ok) throw new Error("shopify_product_json_failed");
          return response.json();
        })
        .catch(function (error) {
          return tryCandidate(index + 1, error);
        });
    }

    return tryCandidate(0).catch(function (error) {
      if (error && error.message === "shopify_product_json_failed") {
        throw new Error("shopify_product_not_published");
      }
      throw error;
    });
  }

  function normalizeShopifyMoney(value) {
    var amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    if (Math.floor(amount) === amount && Math.abs(amount) >= 1000) {
      return amount / 100;
    }
    return amount;
  }

  function getShopifyOptionName(product, index) {
    var options = Array.isArray(product && product.options)
      ? product.options
      : [];
    var option = options[index];
    if (typeof option === "string") return option;
    if (option && option.name) return String(option.name);
    return "";
  }

  function getShopifyVariantOptionValue(variant, index) {
    if (Array.isArray(variant && variant.options)) {
      return variant.options[index] == null ? "" : String(variant.options[index]);
    }
    var key = "option" + String(index + 1);
    return variant && variant[key] == null ? "" : String(variant[key]);
  }

  function normalizeShopifyProductForLupp(product) {
    var variants = Array.isArray(product && product.variants)
      ? product.variants
      : [];
    var options = [];
    var rawOptions = Array.isArray(product && product.options)
      ? product.options
      : [];
    for (var optionIndex = 0; optionIndex < rawOptions.length; optionIndex += 1) {
      var optionName = getShopifyOptionName(product, optionIndex);
      if (optionName) options.push(optionName);
    }

    return {
      external_id: product && product.id ? String(product.id) : "",
      handle: product && product.handle ? String(product.handle) : "",
      image_url:
        (product && (product.featured_image || product.image)) ||
        (variants[0] && variants[0].featured_image && variants[0].featured_image.src) ||
        null,
      options: options,
      title: product && product.title ? String(product.title) : "",
      variants: variants.map(function (variant, variantIndex) {
        var colorName = "";
        var sizeName = "";
        var selectedOptions = [];
        for (var index = 0; index < 3; index += 1) {
          var name = getShopifyOptionName(product, index);
          var value = getShopifyVariantOptionValue(variant, index);
          if (!name && !value) continue;
          selectedOptions.push({ name: name, value: value });
          if (/cor|color|colour/i.test(name)) colorName = value;
          if (/tam|tamanho|size/i.test(name)) sizeName = value;
        }
        if (!sizeName && selectedOptions.length === 1) sizeName = selectedOptions[0].value;
        if (!colorName && selectedOptions.length > 1) colorName = selectedOptions[0].value;

        var variantId = variant && variant.id ? String(variant.id) : "";
        var variantImage =
          (variant &&
            variant.featured_image &&
            (variant.featured_image.src || variant.featured_image)) ||
          null;
        return {
          color_code: colorName || null,
          color_hex: null,
          color_name: colorName || null,
          compare_at_price: normalizeShopifyMoney(variant && variant.compare_at_price),
          external_id: variantId,
          id: variantId || "shopify-variant-" + String(variantIndex),
          image_url: variantImage || null,
          metadata: {
            available_for_sale: !(variant && variant.available === false),
            option1: getShopifyVariantOptionValue(variant, 0),
            option2: getShopifyVariantOptionValue(variant, 1),
            option3: getShopifyVariantOptionValue(variant, 2),
            public_product_json: true,
            raw_selected_options: selectedOptions,
          },
          price: normalizeShopifyMoney(variant && variant.price),
          size_code: sizeName || null,
          size_name: sizeName || null,
          status: "active",
          stock_qty: variant && variant.available === false ? 0 : null,
        };
      }),
    };
  }

  function resolveShopifyDefaultCartItem(productUrl) {
    return fetchShopifyProductJson(productUrl)
      .then(function (product) {
        var variants = Array.isArray(product && product.variants)
          ? product.variants
          : [];
        var variant =
          variants.find(function (item) {
            return item && item.available !== false;
          }) || variants[0];
        var variantId = Number(variant && variant.id);
        if (!Number.isFinite(variantId) || variantId <= 0) {
          throw new Error("shopify_variant_not_found");
        }
        return { id: Math.trunc(variantId), quantity: 1 };
      });
  }

  function postShopifyCartItems(validItems) {
    var root = "/";
    try {
      root =
        window.Shopify &&
        window.Shopify.routes &&
        window.Shopify.routes.root
          ? String(window.Shopify.routes.root)
          : "/";
    } catch (_) {}
    if (root.slice(-1) !== "/") root += "/";

    return fetch(root + "cart/add.js", {
      body: JSON.stringify({ items: validItems }),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return null;
          })
          .then(function (payload) {
            if (!response.ok) {
              throw new Error(
                (payload && (payload.description || payload.message || payload.error)) ||
                  "shopify_cart_request_failed",
              );
            }
            notifyShopifyCartUpdated(validItems, payload);
            return payload || {};
          });
      });
  }

  function addShopifyItemsToCart(items, options) {
    if (!isShopifyStore(activeStore)) {
      return Promise.reject(new Error("shopify_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var variantId = Number((item && (item.variant_id || item.id)) || 0);
        var quantity = Number(item && item.quantity);
        if (!Number.isFinite(variantId) || !Number.isFinite(quantity)) {
          return null;
        }
        if (variantId <= 0 || quantity <= 0) return null;
        return {
          id: Math.trunc(variantId),
          quantity: Math.trunc(quantity),
        };
      })
      .filter(Boolean);

    if (!validItems.length) {
      return resolveShopifyDefaultCartItem(options && options.productUrl).then(
        function (item) {
          return postShopifyCartItems([item]);
        },
      );
    }

    return postShopifyCartItems(validItems);
  }

  function addUpzeroItemsToCart(items, options) {
    if (!isUpzeroStore(activeStore)) {
      return Promise.reject(new Error("upzero_store_not_detected"));
    }

    var validItems = (Array.isArray(items) ? items : [])
      .map(function (item) {
        var variantId = Number(item && item.product_variant_id);
        var quantity = Number(item && item.quantity);
        if (!Number.isFinite(variantId) || !Number.isFinite(quantity)) {
          return null;
        }
        if (variantId <= 0 || quantity <= 0) return null;
        var assetId = Number(item && item.asset_id);
        return {
          assetId: Number.isFinite(assetId) && assetId > 0 ? Math.trunc(assetId) : null,
          productVariantId: Math.trunc(variantId),
          quantity: Math.trunc(quantity),
        };
      })
      .filter(Boolean);

    if (!validItems.length) {
      return Promise.reject(new Error("empty_cart_items"));
    }

    var actionUrl = normalizeUpzeroActionUrl(options && options.productUrl);
    var storefrontStoreId = inferUpzeroStorefrontStoreId();
    var sessionId = null;
    var knownActionIds = [];

    function appendKnownActionIds(ids) {
      var appended = false;
      (Array.isArray(ids) ? ids : []).forEach(function (id) {
        var normalized = String(id || "").toLowerCase();
        if (!normalized || knownActionIds.indexOf(normalized) !== -1) return;
        knownActionIds.push(normalized);
        appended = true;
      });
      return appended;
    }

    function sendWithAction(actionId) {
      if (!actionId) return Promise.reject(new Error("upzero_cart_action_not_found"));
      return fetch(actionUrl, {
        body: JSON.stringify([
          {
            items: validItems,
            sessionId: sessionId || null,
            storeId: storefrontStoreId,
          },
        ]),
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "text/x-component",
          "Content-Type": "text/plain;charset=UTF-8",
          "Next-Action": actionId,
        },
        method: "POST",
      });
    }

    function parseCartResponse(response) {
      if (!response.ok) {
        return response
          .text()
          .catch(function () {
            return "";
          })
          .then(function (text) {
            throw new Error(
              text && text.length < 200 ? text : "upzero_cart_request_failed",
            );
          });
      }
      return response.text().then(function (text) {
        var payload = parseUpzeroServerActionResult(text);
        if (!payload || !payload.ok) {
          throw new Error(
            (payload && payload.error) || "upzero_cart_request_failed",
          );
        }
        var cartSessionId =
          payload.cart && payload.cart.session_id
            ? String(payload.cart.session_id)
            : "";
        if (cartSessionId) {
          persistUpzeroCartSession(cartSessionId, storefrontStoreId);
        }
        notifyUpzeroCartUpdated(
          payload.cart || null,
          storefrontStoreId,
          validItems,
        );
        return payload;
      });
    }

    function tryKnownActions(index, lastError) {
      if (index >= knownActionIds.length) {
        if (lastError && isRecoverableUpzeroCartError(lastError)) {
          upzeroCartActionCache = null;
        }
        return discoverUpzeroCartContext(actionUrl).then(function (context) {
          var discoveredIds = (context && context.actionIds) || [
            context && context.actionId,
          ];
          if (appendKnownActionIds(discoveredIds)) {
            return tryKnownActions(index, lastError);
          }
          throw lastError || new Error("upzero_cart_action_not_found");
        });
      }

      return sendWithAction(knownActionIds[index])
        .then(parseCartResponse)
        .catch(function (error) {
          if (isRecoverableUpzeroCartError(error)) {
            return tryKnownActions(index + 1, error);
          }
          throw error || lastError;
      });
    }

    function prepareUpzeroCartContext() {
      if (
        upzeroCartActionCache &&
        upzeroCartActionCache.url === actionUrl &&
        upzeroCartActionCache.actionId
      ) {
        return Promise.resolve(upzeroCartActionCache);
      }

      return discoverUpzeroCartContext(actionUrl).then(function (context) {
        var discoveredStoreId = Number(context && context.storeId);
        if (Number.isFinite(discoveredStoreId) && discoveredStoreId > 0) {
          storefrontStoreId = Math.trunc(discoveredStoreId);
          if (upzeroConfig) upzeroConfig.storefront_store_id = storefrontStoreId;
        }
        return context;
      }).catch(function (error) {
        if (storefrontStoreId) return null;
        throw error;
      });
    }

    return prepareUpzeroCartContext().then(function () {
      if (!storefrontStoreId) {
        return Promise.reject(
          new Error("upzero_storefront_store_id_not_found"),
        );
      }

      try {
        sessionId = window.localStorage.getItem(
          upzeroCartSessionKey(storefrontStoreId),
        );
      } catch (_) {}

      knownActionIds = [
        upzeroCartActionCache && upzeroCartActionCache.url === actionUrl
          ? upzeroCartActionCache.actionId
          : "",
        "4029045ebafb74fd2e206cf4086710b0e2a4de8c97",
        "406d6dc3473eb9842f60475c022d5883b09d4c8fea",
      ].filter(Boolean);
      appendKnownActionIds(
        upzeroCartActionCache && upzeroCartActionCache.url === actionUrl
          ? upzeroCartActionCache.actionIds
          : [],
      );

      return tryKnownActions(0);
    }).catch(function (actionError) {
      if (actionError && !isRecoverableUpzeroCartError(actionError)) {
        throw actionError;
      }
      if (!storefrontStoreId) throw actionError;
      return addUpzeroItemsToCartApi(validItems, storefrontStoreId, sessionId);
    });
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_UPZERO_CUSTOMER_STATUS_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    detectUpzeroCustomerStatus(activeStore, { forceRefresh: true }).then(
      function (status) {
        postUpzeroCustomerStatus(event.source, event.origin, status);
      },
    );
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_UPZERO_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addUpzeroItemsToCart(data.items, { productUrl: data.productUrl })
      .then(function () {
        postUpzeroCartResponse(event.source, event.origin, data.requestId, {
          ok: true,
        });
      })
      .catch(function (error) {
        postUpzeroCartResponse(event.source, event.origin, data.requestId, {
          error:
            error && error.message
              ? error.message
              : "upzero_cart_request_failed",
          ok: false,
        });
      });
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_NUVEMSHOP_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addNuvemshopItemsToCart(data.items)
      .then(function () {
        postNuvemshopCartResponse(event.source, event.origin, data.requestId, {
          ok: true,
        });
      })
      .catch(function (error) {
        postNuvemshopCartResponse(event.source, event.origin, data.requestId, {
          error:
            error && error.message
              ? error.message
              : "nuvemshop_cart_request_failed",
          ok: false,
        });
      });
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_SHOPIFY_ADD_TO_CART_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    addShopifyItemsToCart(data.items, { productUrl: data.productUrl })
      .then(function () {
        postShopifyCartResponse(event.source, event.origin, data.requestId, {
          ok: true,
        });
      })
      .catch(function (error) {
        postShopifyCartResponse(event.source, event.origin, data.requestId, {
          error:
            error && error.message
              ? error.message
              : "shopify_cart_request_failed",
          ok: false,
        });
      });
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (
      !data ||
      data.type !== "LUPP_SHOPIFY_PRODUCT_REQUEST" ||
      !isTrustedLuppFrameOrigin(event.origin)
    ) {
      return;
    }

    fetchShopifyProductJson(data.productUrl)
      .then(function (product) {
        postShopifyProductResponse(event.source, event.origin, data.requestId, {
          ok: true,
          product: normalizeShopifyProductForLupp(product),
        });
      })
      .catch(function (error) {
        postShopifyProductResponse(event.source, event.origin, data.requestId, {
          error:
            error && error.message
              ? error.message
              : "shopify_product_json_failed",
          ok: false,
        });
      });
  });

  window.addEventListener("message", function (event) {
    var data = event.data || {};
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

  function parsePathList(value) {
    return String(value || "")
      .split(/[\n,]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  function normalizePath(value) {
    var path = String(value || "/").trim();
    try {
      path = getUrlPathname(path, window.location.origin);
    } catch (_) {}
    path = path.replace(/\/+/g, "/");
    if (path.length > 1) path = path.replace(/\/$/, "");
    return path || "/";
  }

  function normalizeUrl(value) {
    try {
      var resolved = resolveUrl(value, window.location.origin);
      return (getUrlOrigin(resolved) + normalizePath(getUrlPathname(resolved))).toLowerCase();
    } catch (_) {
      return normalizePath(value).toLowerCase();
    }
  }

  function currentPath() {
    if (nubesdkFrameMode && configuredProductUrl) {
      return normalizePath(configuredProductUrl);
    }
    return normalizePath(window.location.pathname);
  }

  function primeInlineVideos(root) {
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

  function isHomePath(path) {
    return path === "/" || path === "";
  }

  function isLikelyProductPath(path) {
    return /\/(produto|produtos|product|products)\//i.test(path);
  }

  function extractProductHandle(value) {
    var path = normalizePath(value);
    var match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : "";
  }

  function extractProductKey(value) {
    var handle = extractProductHandle(value);
    var refMatch = handle.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9]*)/i);
    if (refMatch && refMatch[1]) {
      return "ref" + refMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
    }
    var compactRefMatch = handle.match(/\bref(\d+[a-z0-9]*)/i);
    if (compactRefMatch && compactRefMatch[1]) {
      return "ref" + compactRefMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
    }
    var numericPrefix = handle.match(/^\d+/);
    return numericPrefix ? numericPrefix[0] : handle;
  }

  function slugifyForPath(value) {
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

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function firstUpzeroVariantValue(product, keys) {
    var variants = productVariants(product);
    for (var variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      var variant = variants[variantIndex] || {};
      var status = String(variant.status || "active").toLowerCase();
      var stockValue =
        variant.stock_qty !== undefined && variant.stock_qty !== null
          ? variant.stock_qty
          : variant.stock !== undefined && variant.stock !== null
          ? variant.stock
          : variant.quantity;
      var stock = Number(stockValue);
      if (/archived|inactive|disabled/.test(status)) continue;
      if (Number.isFinite(stock) && stock <= 0) continue;
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var value = variant[keys[keyIndex]];
        if (value !== undefined && value !== null && value !== "") {
          return String(value);
        }
      }
    }
    return "";
  }

  function upzeroVariantIsSellable(variant) {
    var status = String((variant && variant.status) || "active").toLowerCase();
    if (/archived|inactive|disabled/.test(status)) return false;
    var stockValue =
      variant && variant.stock_qty !== undefined && variant.stock_qty !== null
        ? variant.stock_qty
        : variant && variant.stock !== undefined && variant.stock !== null
        ? variant.stock
        : variant && variant.quantity;
    var stock = Number(stockValue);
    return !(Number.isFinite(stock) && stock <= 0);
  }

  function upzeroColorSlugFromVariant(variant, product) {
    var directColor =
      (variant &&
        (variant.color_slug ||
          variant.color_name ||
          variant.color ||
          variant.option1)) ||
      "";
    if (directColor) return slugifyForPath(directColor);

    var sizeSlug = slugifyForPath(
      (variant &&
        (variant.size_slug ||
          variant.size_name ||
          variant.size ||
          variant.option2 ||
          variant.option3)) ||
        "",
    );
    var codes = [
      variant && variant.sku,
      variant && variant.external_id,
      variant && variant.integration_id,
    ];
    var referenceSlug = upzeroReferenceSlugFromProduct(
      product || null,
      product && product.product_url,
    );
    var referenceNumber = referenceSlug.replace(/^ref/i, "");

    for (var index = 0; index < codes.length; index += 1) {
      var code = String(codes[index] || "").toLowerCase();
      if (!code) continue;

      var colonParts = code.split(":");
      if (colonParts.length >= 3) {
        var colonColor = slugifyForPath(colonParts[colonParts.length - 2]);
        if (colonColor) return colonColor;
      }

      var normalized = slugifyForPath(code.replace(/^ref\s*[:#-]?\s*/i, "ref"));
      normalized = normalized.replace(/^ref\d+[a-z0-9]*-?/, "");
      if (referenceNumber) {
        normalized = normalized.replace(
          new RegExp("^(?:[a-z0-9]+-)*" + escapeRegExp(referenceNumber) + "-"),
          "",
        );
      }
      if (sizeSlug) {
        normalized = normalized.replace(new RegExp("-" + sizeSlug + "$"), "");
      } else {
        normalized = normalized.replace(/-(pp|p|m|g|gg|xg|xgg|u|unico|único)$/i, "");
      }
      if (normalized && !/^\d+$/.test(normalized)) return normalized;
    }

    return "";
  }

  function upzeroReferenceSlugFromProduct(product, fallbackUrl) {
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

  function upzeroProductHandleFromProduct(product, fallbackUrl) {
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

  function comparableMediaUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    try {
      var parsed = new URL(raw, window.location.href);
      parsed.search = "";
      parsed.hash = "";
      return parsed.href.toLowerCase();
    } catch (_) {
      return raw.split("?")[0].split("#")[0].toLowerCase();
    }
  }

  function firstUpzeroColorSlug(product) {
    var variants = productVariants(product);
    var productImageKey = comparableMediaUrl(product && product.image_url);
    if (productImageKey) {
      for (var imageIndex = 0; imageIndex < variants.length; imageIndex += 1) {
        var imageVariant = variants[imageIndex] || {};
        var variantImageKey = comparableMediaUrl(imageVariant.image_url);
        if (!variantImageKey || variantImageKey !== productImageKey) continue;
        var imageColorSlug = slugifyForPath(
          imageVariant.color_slug ||
            imageVariant.color_name ||
            imageVariant.color_code ||
            imageVariant.color ||
            imageVariant.option1 ||
            "",
        );
        if (imageColorSlug) return imageColorSlug;
      }
    }
    for (var activeIndex = 0; activeIndex < variants.length; activeIndex += 1) {
      var activeVariant = variants[activeIndex] || {};
      if (!upzeroVariantIsSellable(activeVariant)) continue;
      var activeColorSlug = upzeroColorSlugFromVariant(activeVariant, product);
      if (activeColorSlug) return activeColorSlug;
    }
    for (var index = 0; index < variants.length; index += 1) {
      var variant = variants[index] || {};
      var directSlug = slugifyForPath(
        variant.color_slug ||
          variant.color_name ||
          variant.color_code ||
          variant.color ||
          variant.option1 ||
          "",
      );
      if (directSlug) return directSlug;
    }
    var value = firstUpzeroVariantValue(product, [
      "color_slug",
      "color_name",
      "color",
      "option1",
    ]);
    return slugifyForPath(value);
  }

  function repairUpzeroProductUrl(product, fallbackUrl, store) {
    var url = fallbackUrl || (product && product.product_url) || "";
    var base =
      (store && (store.url || store.store_url)) ||
      (upzeroConfig && upzeroConfig.storefront_url) ||
      (activeStore && activeStore.url) ||
      window.location.origin;
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
      var colorSlug = existingColorSlug || firstUpzeroColorSlug(product);
      if (colorSlug) parsed.pathname += "/" + colorSlug;
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      var normalizedBase = String(base || "").replace(/\/$/, "");
      var color = firstUpzeroColorSlug(product);
      return (
        normalizedBase +
        "/produtos/" +
        handle +
        (color ? "/" + color : "")
      );
    }
  }

  function hasProductVariantSegment(value) {
    var path = normalizePath(value);
    var match = path.match(
      /\/(?:produto|produtos|product|products)\/[^/]+\/[^/]+/i,
    );
    return Boolean(match);
  }

  function productPathKeysMatch(left, right) {
    if (hasProductVariantSegment(right)) return false;
    var leftKey = extractProductKey(left);
    var rightKey = extractProductKey(right);
    return Boolean(leftKey && rightKey && leftKey === rightKey);
  }

  function isHomeCarouselWidget() {
    return (
      widgetType === "home_carousel" ||
      widgetType === "horizontal_feed" ||
      widgetType === "home_video_carousel"
    );
  }

  function isCarouselWidget() {
    return (
      isHomeCarouselWidget() ||
      widgetType === "carousel" ||
      widgetType === "video_carousel"
    );
  }

  function isFloatingWidget() {
    return widgetType === "floating_launcher" || widgetType === "floating_video";
  }

  function matchesPattern(path, pattern) {
    var normalizedPath = normalizePath(path).toLowerCase();
    var normalizedPattern = normalizePath(pattern).toLowerCase();
    if (!normalizedPattern || normalizedPattern === "/")
      return normalizedPath === "/";
    if (normalizedPattern.indexOf("*") === -1) {
      return (
        normalizedPath === normalizedPattern ||
        normalizedPath.indexOf(normalizedPattern + "/") === 0 ||
        productPathKeysMatch(normalizedPath, normalizedPattern)
      );
    }

    var expression = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp("^" + expression + "$").test(normalizedPath);
  }

  function matchesAnyPattern(path, patterns) {
    return (patterns || []).some(function (pattern) {
      return matchesPattern(path, pattern);
    });
  }

  function shouldDisplayOnCurrentUrl(config) {
    var path = currentPath();

    if (matchesAnyPattern(path, config.excludePaths)) return false;
    if (isHomeCarouselWidget()) {
      return isHomePath(path) && config.homeExperienceEnabled !== false;
    }
    if (isHomePath(path)) return config.homeExperienceEnabled !== false;
    return true;
  }

  function mappedWidgetType() {
    if (widgetType === "floating_launcher" || isCarouselWidget()) {
      return "floating_video";
    }
    return widgetType;
  }

  function fetchWidgetConfig(storeId) {
    var type = mappedWidgetType();
    return fetchJson(
      "/widgets?store_id=eq." +
        encodeURIComponent(storeId) +
        "&type=eq." +
        encodeURIComponent(type) +
        "&status=eq.active&select=*",
    ).then(function (widgets) {
      return widgets[0] || null;
    });
  }

  function applyWidgetSettings(widget) {
    var settings =
      widget && widget.settings && typeof widget.settings === "object"
        ? widget.settings
        : {};
    var appearance =
      settings.appearance && typeof settings.appearance === "object"
        ? settings.appearance
        : {};
    var display =
      settings.display && typeof settings.display === "object"
        ? settings.display
        : {};
    var carousel =
      settings.carousel && typeof settings.carousel === "object"
        ? settings.carousel
        : {};

    launcherConfig.position = appearance.position || launcherConfig.position;
    launcherConfig.accentColor =
      appearance.accent_color || launcherConfig.accentColor;
    launcherConfig.backgroundColor =
      appearance.background_color || launcherConfig.backgroundColor;
    launcherConfig.textColor =
      appearance.text_color || launcherConfig.textColor;
    launcherConfig.label =
      typeof appearance.label === "string"
        ? appearance.label
        : launcherConfig.label;
    launcherConfig.fontFamily =
      appearance.font_family || launcherConfig.fontFamily;
    launcherConfig.bubbleSize = Number(
      appearance.bubble_size || launcherConfig.bubbleSize,
    );
    launcherConfig.model = appearance.model || launcherConfig.model;
    launcherConfig.offsetX = Number(
      appearance.offset_x || launcherConfig.offsetX,
    );
    launcherConfig.offsetY = Number(
      appearance.offset_y || launcherConfig.offsetY,
    );

    displayConfig.mode = display.mode || displayConfig.mode;
    displayConfig.includePaths = Array.isArray(display.include_paths)
      ? display.include_paths
      : displayConfig.includePaths;
    displayConfig.excludePaths = Array.isArray(display.exclude_paths)
      ? display.exclude_paths
      : displayConfig.excludePaths;
    displayConfig.productMode =
      display.product_mode || displayConfig.productMode;
    displayConfig.hideWithoutVideos = Boolean(
      display.hide_without_videos || displayConfig.hideWithoutVideos,
    );
    if ("home_experience_enabled" in display) {
      displayConfig.homeExperienceEnabled =
        display.home_experience_enabled !== false;
    }
    if ("enabled" in carousel) {
      carouselConfig.enabled = carousel.enabled !== false;
    }
    if (typeof carousel.title === "string") {
      carouselConfig.title = carousel.title || carouselConfig.title;
    }
    if (typeof carousel.description === "string") {
      carouselConfig.description = carousel.description;
    }
    if (typeof carousel.before_heading === "string") {
      carouselConfig.beforeHeading =
        carousel.before_heading || carouselConfig.beforeHeading;
    }
    if ("max_items" in carousel) {
      carouselConfig.maxItems =
        Number(carousel.max_items) || carouselConfig.maxItems;
    }
    if ("mobile_max_items" in carousel) {
      carouselConfig.mobileMaxItems =
        Number(carousel.mobile_max_items) || carouselConfig.mobileMaxItems;
    }
  }

  function linkedProducts(video) {
    return (video.video_products || [])
      .map(function (link) {
        var product = link.products || null;
        if (product && isUpzeroStore(activeStore)) {
          var repairedUrl = repairUpzeroProductUrl(product, product.product_url, activeStore);
          if (repairedUrl && repairedUrl !== product.product_url) {
            var repairedProduct = {};
            for (var key in product) {
              if (Object.prototype.hasOwnProperty.call(product, key)) {
                repairedProduct[key] = product[key];
              }
            }
            repairedProduct.product_url = repairedUrl;
            product = repairedProduct;
          }
        }
        return product;
      })
      .filter(Boolean);
  }

  function videoMediaUrl(video) {
    if (!video) return "";
    return video.video_url || video.playback_url || "";
  }

  function primaryLinkedProduct(video) {
    var products = linkedProducts(video);
    return products[0] || null;
  }

  function firstTextValue(values, fallback) {
    for (var index = 0; index < values.length; index += 1) {
      if (values[index] !== undefined && values[index] !== null && values[index] !== "") {
        return String(values[index]);
      }
    }
    return fallback || "";
  }

  function productVariants(product) {
    return product && Array.isArray(product.product_variants)
      ? product.product_variants
      : [];
  }

  function firstVariantTextValue(product, keys) {
    var variants = productVariants(product);
    for (var variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      var variant = variants[variantIndex] || {};
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var value = variant[keys[keyIndex]];
        if (value !== undefined && value !== null && value !== "") {
          return String(value);
        }
      }
    }
    return "";
  }

  function isGenericProductName(value) {
    var normalized = String(value || "")
      .trim()
      .toLowerCase();
    return !normalized || normalized === "produto" || normalized === "comprar produto";
  }

  function productDisplayName(product, video) {
    var name = firstTextValue([product && product.name, product && product.title], "");
    if (isGenericProductName(name)) name = "";
    return firstTextValue(
      [
        name,
        video && video.title,
        product && product.external_id ? "Produto " + product.external_id : "",
      ],
      "Produto",
    );
  }

  function productImageUrl(product, video) {
    return firstTextValue(
      [
        product && product.image_url,
        product && product.thumbnail_url,
        product && product.image,
        product && product.cover_url,
        firstVariantTextValue(product, ["image_url", "image", "thumbnail_url"]),
        video && video.thumbnail_url,
      ],
      "",
    );
  }

  function formatProductPrice(value) {
    if (value === undefined || value === null || value === "") return "";
    var text = String(value).trim();
    if (!text) return "";
    if (text.indexOf("R$") === 0 || text.indexOf("$") === 0) return text;
    var normalized = text
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    var number = Number(normalized);
    if (!Number.isFinite(number) || number <= 0) return "";
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(number);
    } catch (_) {
      return "R$ " + number.toFixed(2).replace(".", ",");
    }
  }

  function productPriceLabel(product) {
    if (!product) return "";
    return formatProductPrice(
      product.price_promotional ||
        product.promotional_price ||
        product.sale_price ||
        product.price ||
        product.current_price ||
        firstVariantTextValue(product, [
          "price_promotional",
          "promotional_price",
          "sale_price",
          "price",
          "current_price",
        ]),
    );
  }

  function productMatchesCurrentPage(product) {
    if (!product || !product.product_url) return false;

    var externalProductId = currentExternalProductId();
    if (
      externalProductId &&
      product.external_id &&
      String(product.external_id) === externalProductId
    )
      return true;

    var current = normalizeUrl(currentProductUrl());
    var saved = normalizeUrl(product.product_url);
    if (current === saved) return true;

    var currentProductPath = normalizePath(currentProductUrl()).toLowerCase();
    var savedProductPath = normalizePath(product.product_url).toLowerCase();
    if (currentProductPath === savedProductPath) return true;

    var currentHandle = extractProductHandle(currentProductUrl());
    var savedHandle = extractProductHandle(product.product_url);
    return Boolean(
      (currentHandle && savedHandle && currentHandle === savedHandle) ||
      productPathKeysMatch(currentProductUrl(), product.product_url),
    );
  }

  function currentExternalProductId() {
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

  function videoVisibilityMatchesCurrentPage(video) {
    var visibilityUrl = video.product_visibility_url || "";
    if (!visibilityUrl) return null;
    return matchesPattern(currentPath(), visibilityUrl);
  }

  function videoMatchesCurrentProduct(video) {
    if (video.is_product_page_enabled === false) return false;
    if (video.product_visibility_scope === "variant") {
      var variantMatch = videoVisibilityMatchesCurrentPage(video);
      if (variantMatch !== null) return variantMatch;
    }
    return linkedProducts(video).some(productMatchesCurrentPage);
  }

  function filterVideosForCurrentUrl(videos) {
    var path = currentPath();
    var matchingProductVideos = videos.filter(videoMatchesCurrentProduct);
    var feedVideos = videos.filter(function (video) {
      return video.is_feed_enabled !== false;
    });
    var isProduct =
      displayConfig.mode === "product" || isLikelyProductPath(path);

    if (isProduct && matchingProductVideos.length) {
      var seen = {};
      matchingProductVideos.forEach(function (video) {
        seen[video.id] = true;
      });
      return matchingProductVideos.concat(
        feedVideos.filter(function (video) {
          return !seen[video.id];
        }),
      );
    }
    return feedVideos;
  }

  function track(storeId, eventType, videoId, productId, metadata) {
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

    fetch(bootstrapBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(function () {});
  }

  function createRoot() {
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

  var activeStore = null;
  var activeVideos = [];
  var hasLoadedVideoList = false;
  var lastRenderedUrl = "";
  var pendingStorefrontCartRefresh = false;
  var pendingStorefrontCartDetail = null;
  var trackedLauncherImpressions = {};
  var homeCarouselRoot = null;
  var previewVideosPromise = null;
  var homeCarouselAnchorObserver = null;
  var homeCarouselAnchorRetryTimer = null;
  var homeCarouselAnchorRetryCount = 0;

  function ensureRootAttached(root) {
    if (!root.parentNode) {
      (document.body || document.documentElement).appendChild(root);
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function closestSection(element) {
    var node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.tagName && node.tagName.toLowerCase() === "section") {
        return node;
      }
      node = node.parentNode;
    }
    return element;
  }

  function closestShopifySection(element) {
    var node = element;
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
      node = node.parentNode;
    }
    return element;
  }

  function findShopifyProductShowcaseSection() {
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

  function findCarouselAnchorBySelector() {
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

  function insertHomeCarouselNear(anchorNode) {
    if (!anchorNode || !anchorNode.parentNode) return false;
    var placement = String(carouselConfig.anchorPlacement || "before").toLowerCase();
    if (placement === "after") {
      anchorNode.parentNode.insertBefore(homeCarouselRoot, anchorNode.nextSibling);
    } else {
      anchorNode.parentNode.insertBefore(homeCarouselRoot, anchorNode);
    }
    return true;
  }

  function findHomeCarouselBeforeNode() {
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

  function findHomeBenefitsSection() {
    var sections = document.querySelectorAll("section");
    for (var index = 0; index < sections.length; index += 1) {
      var text = normalizeText(sections[index].textContent);
      if (
        text.indexOf("entrega") !== -1 &&
        text.indexOf("exclusivo") !== -1 &&
        text.indexOf("pagamento") !== -1 &&
        text.indexOf("pix") !== -1
      ) {
        return sections[index];
      }
    }
    return null;
  }

  function ensureHomeCarouselRoot() {
    if (!homeCarouselRoot) {
      homeCarouselRoot = document.createElement("div");
      homeCarouselRoot.setAttribute("data-lupp-widget-root", "home_carousel");
      homeCarouselRoot.setAttribute("data-lupp-injected", "true");
    }

    var configuredAnchor = findCarouselAnchorBySelector();
    if (insertHomeCarouselNear(configuredAnchor)) {
      return homeCarouselRoot;
    }

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

    var main = document.querySelector("main, #MainContent, [role='main']");
    if (main) {
      main.insertBefore(homeCarouselRoot, main.firstChild || null);
      return homeCarouselRoot;
    }

    return null;
  }

  function removeHomeCarouselRoot() {
    if (homeCarouselRoot && homeCarouselRoot.parentNode) {
      homeCarouselRoot.parentNode.removeChild(homeCarouselRoot);
    }
  }

  function hasHomeCarouselAnchor() {
    return Boolean(
      findCarouselAnchorBySelector() ||
        findHomeCarouselBeforeNode() ||
        findHomeBenefitsSection() ||
        findShopifyProductShowcaseSection() ||
        document.querySelector("main, #MainContent, [role='main']"),
    );
  }

  function clearHomeCarouselAnchorWatch() {
    if (homeCarouselAnchorObserver) {
      homeCarouselAnchorObserver.disconnect();
      homeCarouselAnchorObserver = null;
    }
    if (homeCarouselAnchorRetryTimer) {
      window.clearTimeout(homeCarouselAnchorRetryTimer);
      homeCarouselAnchorRetryTimer = null;
    }
  }

  function scheduleHomeCarouselAnchorRetry(root) {
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

  function shouldRenderEmbeddedHomeCarousel() {
    return (
      carouselConfig.enabled !== false &&
      isFloatingWidget() &&
      isHomePath(currentPath()) &&
      displayConfig.homeExperienceEnabled !== false
    );
  }

  function renderEmbeddedHomeCarousel(videos, root) {
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
    renderCarousel(carouselRoot, activeStore, videos);
  }

  function loadPreviewVideos(root) {
    if (!shouldUseBootstrap()) return;
    if (previewVideosPromise) return;
    previewVideosPromise = fetchBootstrap("preview")
      .then(function (previewPayload) {
        activeVideos = previewPayload.videos || [];
        hasLoadedVideoList = true;
        renderForCurrentUrl(root);
      })
      .catch(function () {})
      .then(function () {
        previewVideosPromise = null;
      });
  }

  function renderForCurrentUrl(root) {
    if (!activeStore) return;
    lastRenderedUrl = window.location.href;

    if (!shouldDisplayOnCurrentUrl(displayConfig)) {
      debugLog("render skipped: display rules", { path: currentPath() });
      root.innerHTML = "";
      removeHomeCarouselRoot();
      return;
    }

    if (isCarouselWidget() && carouselConfig.enabled === false) {
      debugLog("render skipped: carousel disabled", {
        hint: "settings.carousel.enabled=false ou data-home-carousel-enabled ausente",
      });
      root.innerHTML = "";
      removeHomeCarouselRoot();
      return;
    }

    ensureRootAttached(root);
    var filteredVideos = filterVideosForCurrentUrl(activeVideos);
    if (
      hasLoadedVideoList &&
      !filteredVideos.length &&
      displayConfig.hideWithoutVideos
    ) {
      debugLog("render skipped: hide_without_videos and no matching videos");
      root.innerHTML = "";
      removeHomeCarouselRoot();
      return;
    }
    debugLog("render", {
      videoCount: filteredVideos.length,
      widgetType: widgetType,
    });
    render(root, activeStore, filteredVideos);
    renderEmbeddedHomeCarousel(filteredVideos, root);

    if (shouldRenderEmbeddedHomeCarousel() && !hasLoadedVideoList) {
      loadPreviewVideos(root);
    }
  }

  function watchUrlChanges(root) {
    function scheduleRender() {
      window.setTimeout(function () {
        if (window.location.href === lastRenderedUrl) return;
        renderForCurrentUrl(root);
      }, 80);
    }

    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        scheduleRender();
        return result;
      };
    });

    window.addEventListener("popstate", scheduleRender);
    window.addEventListener("hashchange", scheduleRender);
  }

  var upzeroCustomerRefreshTimer = null;

  function refreshUpzeroCustomerState(root) {
    if (!isUpzeroStore(activeStore)) return;
    if (upzeroCustomerRefreshTimer) {
      window.clearTimeout(upzeroCustomerRefreshTimer);
    }
    upzeroCustomerRefreshTimer = window.setTimeout(function () {
      detectUpzeroCustomerStatus(activeStore, { forceRefresh: true })
        .then(function () {
          renderForCurrentUrl(root);
        })
        .catch(function () {
          renderForCurrentUrl(root);
        });
    }, 160);
  }

  function watchUpzeroCustomerState(root) {
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
        var target = event.target;
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

  function positionStyles() {
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

  function launcherDragStorageKey(store) {
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

  function readLauncherDragPosition(store) {
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

  function saveLauncherDragPosition(store, position) {
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

  function clampLauncherPosition(root, x, y) {
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

  function applyLauncherDragPosition(root, position) {
    if (!position) return;
    root.style.left = position.x + "px";
    root.style.top = position.y + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function installLauncherDrag(root, button, store) {
    if (!root || !button || button.__luppDragInstalled) return;
    button.__luppDragInstalled = true;

    var state = null;
    var previousUserSelect = "";

    function pointFromEvent(event) {
      var source =
        event.touches && event.touches.length
          ? event.touches[0]
          : event.changedTouches && event.changedTouches.length
            ? event.changedTouches[0]
            : event;
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

    function onMove(event) {
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

    function onStart(event) {
      if (event.type === "mousedown" && event.button !== 0) return;
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

    button.addEventListener("mousedown", onStart);
    button.addEventListener("touchstart", onStart, { passive: true });
  }

  function previewVideoFor(videoId, fallbackVideo) {
    if (
      fallbackVideo &&
      (fallbackVideo.video_url || fallbackVideo.thumbnail_url)
    )
      return fallbackVideo;
    if (!videoId) return activeVideos[0] || null;
    for (var index = 0; index < activeVideos.length; index += 1) {
      if (String(activeVideos[index].id) === String(videoId))
        return activeVideos[index];
    }
    return activeVideos[0] || null;
  }

  function openFeedOverlay(store, videoId, fallbackVideo, productUrlOverride) {
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

    function setFrameSrc(customerStatus) {
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
        encodeURIComponent(store.slug) +
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
      upzeroCustomerStatusCache && upzeroCustomerStatusCache.approved
        ? upzeroCustomerStatusCache
        : {
            approved: false,
            loggedIn: false,
            status: shouldForceCustomerRefresh ? "CHECKING" : "not_applicable",
          };

    setFrameSrc(initialCustomerStatus);
    detectUpzeroCustomerStatus(store, {
      forceRefresh: shouldForceCustomerRefresh,
    }).then(function (customerStatus) {
      setFrameSrc(customerStatus);
    });

    var feedbackShown = false;

    function trackFeedClose(reason) {
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
        had_cart_update: !!pendingStorefrontCartRefresh,
      });
    }

    function destroyOverlay(reason) {
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
        escapeHtml(luppBaseUrl || "https://www.playluup.com.br") +
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
      var optionList = feedback.querySelector("[data-lupp-feedback-options]");
      var starList = feedback.querySelector("[data-lupp-feedback-stars]");
      var ratingCount = feedback.querySelector("[data-lupp-rating-count]");

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
        var starButton = event.target.closest("[data-lupp-feedback-star]");
        if (starButton) {
          selectedRating = Number(
            starButton.getAttribute("data-lupp-feedback-star") || 0,
          );
          renderStars();
          return;
        }

        var optionButton = event.target.closest("[data-lupp-feedback-option]");
        if (optionButton) {
          selected =
            optionButton.getAttribute("data-lupp-feedback-option") || "";
          renderOptions();
          return;
        }

        if (event.target.closest("[data-lupp-feedback-submit]")) {
          var text =
            feedback.querySelector("[data-lupp-feedback-text]").value || "";
          track(store.id, "widget_view", videoId || null, null, {
            action: "feedback_submit",
            feedback_option: selected,
            feedback_rating: selectedRating,
            feedback_text: text,
          });
          destroyOverlay("feedback_submit");
          return;
        }

        if (event.target.closest("[data-lupp-feedback-skip]")) {
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

  function trackLauncherImpression(root, store, video) {
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

  function renderLauncher(root, store, videos) {
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

    var launcherButton = root.querySelector("[data-lupp-launcher]");
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

  function renderStoriesBar(root, store, videos) {
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
      var button = event.target.closest("[data-video]");
      if (!button) return;
      openFeedOverlay(store, button.getAttribute("data-video"));
    });
  }

  function renderCarousel(root, store, videos) {
    var accent = launcherConfig.accentColor || store.button_color || "#006BFF";
    var isMobileViewport =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 640px)").matches;
    var configuredMaxItems = isMobileViewport
      ? carouselConfig.mobileMaxItems
      : carouselConfig.maxItems;
    var items = videos.slice(0, Math.max(1, Number(configuredMaxItems) || 1));
    var upzeroCustomerStatus = isUpzeroStore(store)
      ? upzeroCustomerStatusCache
      : { approved: true, loggedIn: true };
    var descriptionHtml = carouselConfig.description
      ? '<p class="lupp-home-carousel-description">' +
        escapeHtml(carouselConfig.description) +
        "</p>"
      : "";

    function productCardHtml(video) {
      var product = primaryLinkedProduct(video);
      var imageUrl = productImageUrl(product, video);
      var name = productDisplayName(product, video);
      var restricted =
        isUpzeroStore(store) &&
        !(upzeroCustomerStatus && upzeroCustomerStatus.approved);
      var price = restricted ? "" : productPriceLabel(product);
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
      var target = event.target;
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
      var linkedProduct = primaryLinkedProduct(fallbackVideo);
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
      (!upzeroCustomerStatusCache ||
        Date.now() - upzeroCustomerStatusLastRefreshAt > 2500)
    ) {
      var statusKeyBeforeRefresh = upzeroCustomerStatusCache
        ? String(upzeroCustomerStatusCache.status) +
          ":" +
          String(upzeroCustomerStatusCache.approved)
        : "";
      detectUpzeroCustomerStatus(store, { forceRefresh: true })
        .then(function () {
          var statusKeyAfterRefresh = upzeroCustomerStatusCache
            ? String(upzeroCustomerStatusCache.status) +
              ":" +
              String(upzeroCustomerStatusCache.approved)
            : "";
          // Only re-render on an actual status change; re-rendering
          // unconditionally loops forever for logged-out visitors.
          if (statusKeyAfterRefresh === statusKeyBeforeRefresh) return;
          if (root && root.parentNode) renderCarousel(root, store, videos);
        })
        .catch(function () {});
    }
  }

  function render(root, store, videos) {
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

  function startWidget() {
    if (shouldUseBootstrap()) {
      fetchBootstrap("meta")
        .then(function (payload) {
          var store = payload.store || {
            id: null,
            slug: storeSlug || externalStoreId,
            button_color: launcherConfig.accentColor,
          };
          var widgetConfig = payload.widget || null;
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
            store.upzero_config = upzeroConfig;
            if (upzeroConfig.storefront_url && !store.url) {
              store.url = String(upzeroConfig.storefront_url);
            }
          }
          applyWidgetSettings(widgetConfig);
          if (!shouldDisplayOnCurrentUrl(displayConfig)) {
            debugLog("abort: display rules exclude current URL", {
              excludePaths: displayConfig.excludePaths,
              homeExperienceEnabled: displayConfig.homeExperienceEnabled,
              path: currentPath(),
            });
            emitWidgetAborted("display_rules", { path: currentPath() });
            root.remove();
            return;
          }

          track(store.id, "widget_view", null, null, {
            bootstrap_mode: "meta",
          });
          activeStore = store;
          activeVideos = [];
          hasLoadedVideoList = false;
          renderForCurrentUrl(root);
          if (shouldAutoplayLauncherPreview()) {
            loadPreviewVideos(root);
          }
        })
        .catch(function (error) {
          debugLog("abort: bootstrap error", error.message);
          emitWidgetAborted("bootstrap_error", { message: error.message });
          console.warn("[Luup]", error.message);
          root.remove();
        });
      return;
    }

    fetchJson(
      "/stores?slug=eq." +
        encodeURIComponent(storeSlug) +
        "&status=eq.active&select=*",
    )
      .then(function (stores) {
        var store = stores[0] || {
          id: null,
          slug: storeSlug,
          button_color: launcherConfig.accentColor,
        };

        var widgetConfigPromise = fetchWidgetConfig(store.id).catch(function () {
          return null;
        });

        return widgetConfigPromise.then(function (widgetConfig) {
          if (!widgetConfig && requireActiveWidget) {
            debugLog("abort: no active widget config with require-active");
            emitWidgetAborted("no_active_widget");
            root.remove();
            return null;
          }

          applyWidgetSettings(widgetConfig);
          if (!shouldDisplayOnCurrentUrl(displayConfig)) {
            debugLog("abort: display rules exclude current URL", {
              path: currentPath(),
            });
            emitWidgetAborted("display_rules", { path: currentPath() });
            root.remove();
            return null;
          }

          track(store.id, "widget_view");
          activeStore = store;
          activeVideos = [];
          hasLoadedVideoList = false;
          detectUpzeroCustomerStatus(store, { forceRefresh: true }).catch(function () {});
          renderForCurrentUrl(root);
          return null;
        });
      })
      .catch(function (error) {
        debugLog("degraded render after fetch error", error.message);
        console.warn("[Luup]", error.message);
        renderLauncher(
          root,
          { id: null, slug: storeSlug, button_color: launcherConfig.accentColor },
          [],
        );
        emitWidgetRendered({ degraded: true, widgetType: widgetType });
      });
  }

  runAfterPageReady(startWidget);
})();
