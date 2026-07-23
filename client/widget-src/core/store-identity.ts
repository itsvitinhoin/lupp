// Lupp widget – store/platform identification: reading the storefront's own
// globals when the embed didn't set an explicit external-store-id, and
// classifying a resolved store payload by platform.
import type { AdapterPlatform, BootstrapPayload, StorePayload } from "../types";

export function inferNuvemshopStoreId(): string {
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
    const hostMatch = window.location.hostname.match(/^(\d+)\.lojavirtualnuvem\.com\.br$/i);
    if (hostMatch) return hostMatch[1];
  } catch (_) {}
  return "";
}

export function inferShopifyStoreId(): string {
  try {
    if (window.Shopify && window.Shopify.shop && /\.myshopify\.com$/i.test(String(window.Shopify.shop))) {
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

export function isNuvemshopStore(store: StorePayload | null | undefined, externalStoreId: string): boolean {
  const platform = String((store && store.platform) || "").toLowerCase();
  return (
    platform === "nuvemshop" ||
    (!platform && Boolean(externalStoreId) && !/\.myshopify\.com$/i.test(String(externalStoreId || "")))
  );
}

export function isShopifyStore(store: StorePayload | null | undefined): boolean {
  return String((store && store.platform) || "").toLowerCase() === "shopify";
}

export function resolveAdapterPlatform(
  payload: BootstrapPayload,
  externalStoreId: string,
): AdapterPlatform | "" {
  const platform = String((payload && payload.store && payload.store.platform) || "").toLowerCase();
  if (platform === "upzero" || platform === "shopify" || platform === "nuvemshop") {
    return platform;
  }
  if (/\.myshopify\.com$/i.test(String(externalStoreId || "")) || window.Shopify) return "shopify";
  if (window.LS || window.Tiendanube) return "nuvemshop";
  return "";
}
