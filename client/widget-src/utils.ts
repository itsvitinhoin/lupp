// Lupp widget – shared helpers (URL/hostname/query parsing, HTML escaping,
// debug logging, lifecycle + cart DOM events). Used by the core bundle and
// re-exposed to the platform adapters through
// window.__LUPP_WIDGET_BRIDGE__.utils.

// Opt-in diagnostics: set window.__LUUP_DEBUG__ = true before the widget
// loads to trace config resolution, bootstrap calls and abort reasons.
export function debugLog(...args: unknown[]): void {
  try {
    if (!window.__LUUP_DEBUG__) return;
    console.log("[Luup:debug]", ...args);
  } catch (_) {}
}

// Lifecycle handshake for wrapper scripts (e.g. the Nuvemshop light
// launcher): they must not remove their placeholder until the widget
// actually renders, and must clean up immediately when it aborts.
export function emitWidgetLifecycleEvent(
  name: string,
  detail?: Record<string, unknown>,
): void {
  try {
    let event: Event;
    if (typeof window.CustomEvent === "function") {
      event = new CustomEvent(name, { detail: detail || {} });
    } else {
      const legacyEvent = document.createEvent("CustomEvent");
      legacyEvent.initCustomEvent(name, false, false, detail || {});
      event = legacyEvent;
    }
    document.dispatchEvent(event);
  } catch (_) {}
}

export function emitWidgetAborted(
  reason: string,
  detail?: Record<string, unknown>,
): void {
  const payload = detail || {};
  payload.reason = reason;
  emitWidgetLifecycleEvent("luup:widget-aborted", payload);
}

export function emitWidgetRendered(detail?: Record<string, unknown>): void {
  emitWidgetLifecycleEvent("luup:widget-rendered", detail || {});
}

export function createAnchor(url?: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = url || window.location.href;
  return anchor;
}

export function resolveUrl(value: string, base?: string): string {
  try {
    if (typeof URL !== "undefined") return new URL(value, base).href;
  } catch (_) {}
  try {
    const anchor = createAnchor(base || window.location.href);
    const resolver = document.createElement("a");
    resolver.href = anchor.href;
    resolver.href = value || "";
    return resolver.href;
  } catch (_) {
    return String(value || "");
  }
}

export function getUrlOrigin(value: string): string {
  try {
    if (typeof URL !== "undefined") return new URL(value).origin;
  } catch (_) {}
  const anchor = createAnchor(value);
  return (
    anchor.protocol +
    "//" +
    anchor.hostname +
    (anchor.port ? ":" + anchor.port : "")
  );
}

export function getUrlHostname(value: string): string {
  try {
    if (typeof URL !== "undefined") {
      return new URL(value, window.location.href).hostname;
    }
  } catch (_) {}
  return createAnchor(resolveUrl(value, window.location.href)).hostname;
}

export function normalizedHostname(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

export function sameStorefrontHostname(left: unknown, right: unknown): boolean {
  return normalizedHostname(left) === normalizedHostname(right);
}

// Plain-object guard for unwrapping nested payload/settings fields.
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getUrlPathname(value: string, base?: string): string {
  try {
    if (typeof URL !== "undefined") return new URL(value, base).pathname;
  } catch (_) {}
  return (
    createAnchor(resolveUrl(value, base || window.location.href)).pathname || "/"
  );
}

export function readQueryValue(url: string, name: string): string | null {
  const queryIndex = String(url || "").indexOf("?");
  if (queryIndex === -1) return null;
  const hashIndex = String(url).indexOf("#", queryIndex);
  const query = String(url).slice(
    queryIndex + 1,
    hashIndex === -1 ? undefined : hashIndex,
  );
  const parts = query.split("&");
  for (let index = 0; index < parts.length; index += 1) {
    const pair = parts[index].split("=");
    try {
      if (decodeURIComponent(pair[0] || "") === name) {
        return decodeURIComponent((pair[1] || "").replace(/\+/g, " "));
      }
    } catch (_) {}
  }
  return null;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

export function escapeHtml(value: unknown): string {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return HTML_ESCAPES[char];
  });
}

export function emitCartEvent(eventName: string, detail: unknown): void {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (_) {}
  try {
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  } catch (_) {}
}
