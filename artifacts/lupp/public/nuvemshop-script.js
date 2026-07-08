(function () {
  "use strict";

  if (window.__LUUP_NUVEMSHOP_SCRIPT_LOADED__) return;
  window.__LUUP_NUVEMSHOP_SCRIPT_LOADED__ = true;

  var currentScript = document.currentScript;
  var widgetRequested = false;
  var launcher = null;
  var styleElement = null;
  var storeIdWaitStartedAt = 0;
  var autoRequestTimer = null;
  var widgetAppendScheduled = false;

  if (!currentScript) {
    var scripts = document.getElementsByTagName("script");
    currentScript = scripts[scripts.length - 1] || null;
  }

  function readQueryValue(url, name) {
    var queryIndex = String(url || "").indexOf("?");
    if (queryIndex === -1) return "";
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
    return "";
  }

  function readConfig(name, fallback) {
    var fromQuery = readQueryValue(currentScript && currentScript.src, name);
    if (fromQuery) return fromQuery;
    return fallback || "";
  }

  function inferStoreId() {
    try {
      if (window.LS && window.LS.store && window.LS.store.id !== undefined && window.LS.store.id !== null) {
        return String(window.LS.store.id);
      }
      if (window.LS && window.LS.store_id !== undefined && window.LS.store_id !== null) {
        return String(window.LS.store_id);
      }
      if (window.Tiendanube && window.Tiendanube.storeId !== undefined && window.Tiendanube.storeId !== null) {
        return String(window.Tiendanube.storeId);
      }
      var match = window.location.hostname.match(/^(\d+)\.lojavirtualnuvem\.com\.br$/i);
      if (match) return match[1];
    } catch (_) {}
    return "";
  }

  function setAttribute(script, name, value) {
    if (value !== undefined && value !== null && String(value) !== "") {
      script.setAttribute(name, String(value));
    }
  }

  function isOfiSafeMode() {
    var ofi = readConfig("lupp_ofi", "");
    if (ofi === "true" || ofi === "1") return true;
    var strategy = readConfig("lupp_load_strategy", "");
    return strategy === "balanced" || strategy === "idle" || strategy === "ofi";
  }

  function scheduleIdle(callback, fallbackDelay) {
    var run = function () {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(callback, { timeout: 2600 });
        return;
      }
      window.setTimeout(callback, fallbackDelay || 700);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
      return;
    }

    run();
  }

  function onReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    window.setTimeout(callback, 1);
  }

  function removeLauncherSoon() {
    window.setTimeout(function () {
      if (launcher && launcher.parentNode) launcher.parentNode.removeChild(launcher);
      launcher = null;
    }, 2200);
  }

  function resolveExternalStoreId() {
    return (
      readConfig("lupp_external_store_id", "") ||
      readConfig("external_store_id", "") ||
      readConfig("nuvemshop_store_id", "") ||
      readConfig("store", "") ||
      inferStoreId()
    );
  }

  function resolveStoreDomain() {
    return (
      readConfig("lupp_store_domain", "") ||
      readConfig("store_domain", "") ||
      (window.location && window.location.hostname) ||
      ""
    );
  }

  function buildWidgetScript(externalStoreId) {
    var appUrl = readConfig("lupp_url", "https://www.playluup.com.br").replace(/\/$/, "");

    var widgetScript = document.createElement("script");
    widgetScript.async = true;
    if ("fetchPriority" in widgetScript) widgetScript.fetchPriority = "low";
    widgetScript.src = appUrl + "/widget.js";
    widgetScript.setAttribute("data-lupp-nuvemshop-widget", "true");

    setAttribute(widgetScript, "data-external-store-id", externalStoreId);
    setAttribute(widgetScript, "data-store-domain", resolveStoreDomain());
    setAttribute(widgetScript, "data-store", readConfig("lupp_store", ""));
    setAttribute(widgetScript, "data-widget", readConfig("lupp_widget", "floating_launcher"));
    setAttribute(widgetScript, "data-lupp-url", appUrl);
    setAttribute(widgetScript, "data-require-active", readConfig("lupp_require_active", "true"));
    setAttribute(widgetScript, "data-load-strategy", readConfig("lupp_load_strategy", "balanced"));
    setAttribute(widgetScript, "data-preview-mode", readConfig("lupp_preview_mode", "balanced"));

    widgetScript.onload = removeLauncherSoon;
    widgetScript.onerror = function () {
      if (launcher) launcher.removeAttribute("data-lupp-loading");
    };

    return widgetScript;
  }

  function waitForStoreId(callback) {
    var externalStoreId = resolveExternalStoreId();
    if (externalStoreId) {
      callback(externalStoreId);
      return;
    }

    if (resolveStoreDomain()) {
      callback("");
      return;
    }

    if (!storeIdWaitStartedAt) storeIdWaitStartedAt = Date.now();
    if (Date.now() - storeIdWaitStartedAt > 6000) {
      widgetRequested = false;
      storeIdWaitStartedAt = 0;
      if (launcher) launcher.removeAttribute("data-lupp-loading");
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[Luup] Nuvemshop store id ainda não disponível para iniciar o widget.");
      }
      return;
    }

    window.setTimeout(function () {
      waitForStoreId(callback);
    }, 160);
  }

  function requestWidget() {
    if (widgetRequested) return;
    widgetRequested = true;
    if (autoRequestTimer) {
      window.clearTimeout(autoRequestTimer);
      autoRequestTimer = null;
    }
    if (launcher) launcher.setAttribute("data-lupp-loading", "true");

    waitForStoreId(function (externalStoreId) {
      storeIdWaitStartedAt = 0;
      var widgetScript = buildWidgetScript(externalStoreId);
      if (widgetAppendScheduled) return;
      widgetAppendScheduled = true;
      scheduleIdle(function () {
        (document.head || document.body || document.documentElement).appendChild(widgetScript);
      }, isOfiSafeMode() ? 900 : 100);
    });
  }

  function bindIntentEvents() {
    var options = { once: true, passive: true };
    window.addEventListener("pointerdown", requestWidget, options);
    window.addEventListener("touchstart", requestWidget, options);
    window.addEventListener("mousedown", requestWidget, options);
    window.addEventListener("keydown", requestWidget, { once: true });
    window.addEventListener("scroll", requestWidget, options);
  }

  function scheduleAutoRequest() {
    if (autoRequestTimer || widgetRequested) return;
    var delay = Number(readConfig("lupp_auto_load_delay", "250"));
    if (!Number.isFinite(delay) || delay < 0) delay = 250;
    if (isOfiSafeMode()) delay = Math.max(delay, 1800);
    autoRequestTimer = window.setTimeout(requestWidget, delay);
  }

  function createLightLauncher() {
    if (document.getElementById("lupp-nuvemshop-light-launcher")) return;

    styleElement = document.createElement("style");
    styleElement.textContent =
      "#lupp-nuvemshop-light-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:64px;height:64px;border:0;border-radius:999px;background:#176fff;box-shadow:0 12px 34px rgba(16,28,48,.24);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .18s ease,opacity .18s ease}" +
      "#lupp-nuvemshop-light-launcher:before{content:'';display:block;width:26px;height:26px;border-radius:999px;border:3px solid #fff;border-left-color:transparent;box-sizing:border-box}" +
      "#lupp-nuvemshop-light-launcher:after{content:'';position:absolute;inset:-6px;border-radius:999px;border:1px solid rgba(23,111,255,.32);animation:luppPulse 1.8s ease-out infinite}" +
      "#lupp-nuvemshop-light-launcher[data-lupp-loading='true']:before{animation:luppSpin .8s linear infinite}" +
      "@keyframes luppSpin{to{transform:rotate(360deg)}}@keyframes luppPulse{0%{opacity:.8;transform:scale(.86)}100%{opacity:0;transform:scale(1.25)}}" +
      "@media (max-width:640px){#lupp-nuvemshop-light-launcher{right:14px;bottom:14px;width:58px;height:58px}}";
    (document.head || document.documentElement).appendChild(styleElement);

    launcher = document.createElement("button");
    launcher.id = "lupp-nuvemshop-light-launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Abrir videos da loja");
    launcher.onclick = requestWidget;
    document.body.appendChild(launcher);
  }

  onReady(function () {
    createLightLauncher();
    bindIntentEvents();
    scheduleAutoRequest();
  });
})();
