// Lupp widget – shared helpers (URL/hostname/query parsing, HTML escaping,
// debug logging, lifecycle + cart DOM events). Extracted verbatim from the
// original single-file widget.js; used by the core bundle and re-exposed to
// the platform adapters through window.__LUPP_WIDGET_BRIDGE__.utils.

// Opt-in diagnostics: set window.__LUUP_DEBUG__ = true before the widget
// loads to trace config resolution, bootstrap calls and abort reasons.
export function debugLog() {
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
export function emitWidgetLifecycleEvent(name, detail) {
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

export function emitWidgetAborted(reason, detail) {
  var payload = detail || {};
  payload.reason = reason;
  emitWidgetLifecycleEvent("luup:widget-aborted", payload);
}

export function emitWidgetRendered(detail) {
  emitWidgetLifecycleEvent("luup:widget-rendered", detail || {});
}

export function createAnchor(url) {
  var anchor = document.createElement("a");
  anchor.href = url || window.location.href;
  return anchor;
}

export function resolveUrl(value, base) {
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

export function getUrlOrigin(value) {
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

export function getUrlHostname(value) {
  try {
    if (typeof URL !== "undefined") return new URL(value, window.location.href).hostname;
  } catch (_) {}
  return createAnchor(resolveUrl(value, window.location.href)).hostname;
}

export function normalizedHostname(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

export function sameStorefrontHostname(left, right) {
  return normalizedHostname(left) === normalizedHostname(right);
}

// Plain-object guard for unwrapping nested payload/settings fields.
export function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function getUrlPathname(value, base) {
  try {
    if (typeof URL !== "undefined") return new URL(value, base).pathname;
  } catch (_) {}
  return createAnchor(resolveUrl(value, base || window.location.href)).pathname || "/";
}

export function readQueryValue(url, name) {
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

export function escapeHtml(value) {
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

export function emitCartEvent(eventName, detail) {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (_) {}
  try {
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (_) {}
}
