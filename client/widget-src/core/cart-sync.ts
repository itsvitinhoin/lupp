// Lupp widget – reflecting a cart update (from any platform adapter) back
// onto the storefront's own UI: rewriting visible cart-count badges and
// re-emitting the update as every cart-event name a theme might listen for,
// then reloading the page if the platform doesn't otherwise refresh itself.
import { emitCartEvent } from "../utils";
import { ctx, isUpzeroStore } from "../context";
import { isNuvemshopStore, isShopifyStore } from "./store-identity";
import type { CartUpdateDetail } from "../types";

function formatUpzeroCartCount(quantity: number): string {
  return quantity === 1 ? "1 PC." : quantity + " PCS.";
}

export function updateUpzeroCartCounters(quantity: number): void {
  if (!document.body || !Number.isFinite(quantity)) return;

  const label = formatUpzeroCartCount(Math.max(0, Math.trunc(quantity)));
  const selector =
    '[data-cart-count],[data-cart-quantity],[data-testid*="cart" i],' +
    '[class*="cart-count" i],[class*="cart-quantity" i],' +
    '[class*="cart-badge" i],[aria-label*="carrinho" i]';

  try {
    Array.prototype.forEach.call(document.querySelectorAll(selector), (element: Element) => {
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
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const text = node && node.nodeValue ? node.nodeValue : "";
        return /^\s*\d+\s*(?:pc|pcs|pç|pçs|peça|peças)\.?\s*$/i.test(text)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = label;
    });
  } catch (_) {}
}

export function updateNuvemshopCartCounters(quantity: number): void {
  if (!quantity || quantity <= 0 || typeof document === "undefined") return;
  try {
    const counters = document.querySelectorAll(".js-cart-widget-amount, [data-component='cart-button'] .badge");
    Array.prototype.forEach.call(counters, (counter: Element) => {
      let current = parseInt(String(counter.textContent || "0").replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(current) || current < 0) current = 0;
      if (current === 0) {
        counter.textContent = String(quantity);
      }
      counter.classList.remove("d-none", "d-md-inline-block");
      counter.removeAttribute("hidden");
    });
  } catch (_) {}
}

export function updateShopifyCartCounters(quantity: number): void {
  if (!quantity || quantity <= 0 || typeof document === "undefined") return;
  try {
    const counters = document.querySelectorAll(
      "[data-cart-count], .cart-count, .cart-item-count, .cart-count-bubble span, .header__icon--cart .badge",
    );
    Array.prototype.forEach.call(counters, (counter: Element) => {
      let current = parseInt(String(counter.textContent || "0").replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(current) || current < 0) current = 0;
      counter.textContent = String(current + quantity);
      counter.classList.remove("hidden", "d-none", "visually-hidden");
      counter.removeAttribute("hidden");
      counter.setAttribute("aria-hidden", "false");
    });
  } catch (_) {}
}

export function flushPendingStorefrontCartRefresh(): void {
  const sharedState = ctx.sharedState;
  if (!sharedState.pendingStorefrontCartRefresh) return;
  const detail: Partial<CartUpdateDetail> = sharedState.pendingStorefrontCartDetail || {};
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
  ].forEach((eventName) => emitCartEvent(eventName, detail));

  updateUpzeroCartCounters(Number(detail.quantity || 0));
  updateNuvemshopCartCounters(Number(detail.quantity || 0));
  updateShopifyCartCounters(Number(detail.quantity || 0));

  const activeStore = sharedState.activeStore;
  if (
    !isUpzeroStore(activeStore) &&
    !isNuvemshopStore(activeStore, ctx.externalStoreId) &&
    !isShopifyStore(activeStore)
  ) {
    return;
  }

  window.setTimeout(() => {
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
