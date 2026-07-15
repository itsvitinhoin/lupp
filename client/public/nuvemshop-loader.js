(function () {
  var currentScript = document.currentScript;
  var fallbackAppUrl = "https://www.playluup.com.br";

  function getSearchParams() {
    try {
      return new URL(currentScript && currentScript.src ? currentScript.src : window.location.href, window.location.href).searchParams;
    } catch (_) {
      return new URLSearchParams();
    }
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
      var hostMatch = window.location.hostname.match(/^(\d+)\.lojavirtualnuvem\.com\.br$/i);
      if (hostMatch) return hostMatch[1];
    } catch (_) {}
    return "";
  }

  function setData(script, name, value) {
    if (value !== undefined && value !== null && String(value).trim()) {
      script.setAttribute("data-" + name, String(value));
    }
  }

  function waitForStoreId(callback, startedAt) {
    var externalStoreId =
      params.get("external_store_id") ||
      params.get("lupp_external_store_id") ||
      inferStoreId();

    if (externalStoreId) {
      callback(externalStoreId);
      return;
    }

    var firstAttempt = startedAt || Date.now();
    if (Date.now() - firstAttempt > 6000) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[Luup] Nuvemshop store id ainda não disponível para iniciar o widget.");
      }
      callback("");
      return;
    }

    window.setTimeout(function () {
      waitForStoreId(callback, firstAttempt);
    }, 160);
  }

  var params = getSearchParams();
  var appUrl = (params.get("lupp_url") || params.get("lupp_base_url") || fallbackAppUrl).replace(/\/$/, "");
  waitForStoreId(function (externalStoreId) {
    var widgetScript = document.createElement("script");

    widgetScript.async = true;
    widgetScript.src = appUrl + "/widget.js";
    setData(widgetScript, "store", params.get("lupp_store") || params.get("store"));
    setData(widgetScript, "widget", params.get("lupp_widget") || params.get("widget") || "floating_launcher");
    setData(widgetScript, "external-store-id", externalStoreId);
    setData(widgetScript, "api-url", params.get("lupp_api_url") || params.get("api_url"));
    setData(widgetScript, "lupp-url", appUrl);
    setData(widgetScript, "require-active", params.get("lupp_require_active") || "true");

    document.head.appendChild(widgetScript);
  });
})();
