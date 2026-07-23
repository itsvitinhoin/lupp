// Lupp widget – core-side customer status resolver: non-Upzero stores keep
// the historical fast path; Upzero stores delegate to the lazily loaded
// Upzero adapter, which owns the actual detection heuristics
// (platforms/upzero.ts's detectUpzeroCustomerStatus).
import { debugLog } from "../utils";
import { ctx, isUpzeroStore } from "../context";
import { loadAdapter } from "./adapter-loader";
import type { CustomerStatus, StorePayload, UpzeroAdapter } from "../types";

export function detectCustomerStatus(
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
    .then((adapter) => (adapter as UpzeroAdapter).detectUpzeroCustomerStatus(store, options))
    .then((status) => {
      debugLog("customer status resolved", { widgetType: ctx.widgetType, ...status });
      return status;
    })
    .catch(() => {
      // Mirrors detectUpzeroCustomerStatus's final fallback when every
      // detection strategy fails (here: the adapter itself did not load).
      const fallback: CustomerStatus = {
        approved: false,
        loggedIn: false,
        source: "fallback",
        status: "UNKNOWN",
      };
      debugLog("customer status resolution failed, using fallback", fallback);
      return fallback;
    });
}
