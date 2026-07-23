// Lupp widget – analytics beacon to POST /api/widget/events. Visitor/session
// ids share one storage-backed generator (localStorage persists across
// visits, sessionStorage is per tab session).
import { ctx } from "../context";
import { currentProductUrl } from "./upzero-product-url";

function ensureStoredId(storage: Storage, key: string): string {
  const current = storage.getItem(key);
  if (current) return current;
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  storage.setItem(key, id);
  return id;
}

function ensureVisitorId(): string {
  return ensureStoredId(localStorage, "lupp_visitor_id");
}

function ensureSessionId(): string {
  return ensureStoredId(sessionStorage, "lupp_session_id");
}

export function track(
  storeId: string | null | undefined,
  eventType: string,
  videoId?: string | null,
  productId?: string | null,
  metadata?: Record<string, unknown>,
): void {
  if (!storeId) return;
  const payload = {
    store_id: storeId,
    video_id: videoId || null,
    product_id: productId || null,
    event_type: eventType,
    visitor_id: ensureVisitorId(),
    session_id: ensureSessionId(),
    url: window.location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
    metadata: Object.assign({ widget_type: ctx.widgetType, product_url: currentProductUrl() }, metadata || {}),
  };

  // keepalive lets the request outlive the page — feed_close (with dwell
  // time) fires exactly while the storefront tab is navigating away.
  fetch(ctx.eventsBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
