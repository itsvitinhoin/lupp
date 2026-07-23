// Lupp widget – top-level postMessage router for requests the feed iframe
// (or a NubeSDK frame) sends directly to the storefront page, as opposed to
// a specific platform adapter. Every handler checks isTrustedLuppFrameOrigin
// before acting — this is the widget's only trust boundary against a
// malicious page reusing the feed's message vocabulary.
import { resolveUrl } from "../utils";
import { ctx } from "../context";
import { isTrustedLuppFrameOrigin, postUpzeroCustomerStatus } from "../feed";
import type { CustomerStatus } from "../types";

export function installTopLevelMessageHandlers(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = (event.data || {}) as Record<string, unknown>;
    if (!data || data.type !== "LUPP_UPZERO_CUSTOMER_STATUS_REQUEST" || !isTrustedLuppFrameOrigin(event.origin)) {
      return;
    }

    ctx.detectCustomerStatus(ctx.sharedState.activeStore, { forceRefresh: true }).then((status: CustomerStatus) => {
      postUpzeroCustomerStatus(event.source, event.origin, status);
    });
  });

  window.addEventListener("message", (event: MessageEvent) => {
    const data = (event.data || {}) as Record<string, unknown>;
    if (!data || data.type !== "LUPP_OPEN_PRODUCT_PAGE_REQUEST" || !isTrustedLuppFrameOrigin(event.origin)) {
      return;
    }

    const url = String(data.url || "");
    if (!url) return;
    try {
      window.location.href = resolveUrl(url, window.location.href);
    } catch (_) {
      window.location.href = url;
    }
  });
}
