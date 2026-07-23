// Lupp widget – Upzero product-URL repair. Slim server products carry no
// variant/color path segments, so a saved product_url from a video's linked
// product needs its handle rebuilt against the current store rather than
// used verbatim (variant-specific paths would 404). Mirrors the equivalent
// matching semantics server/src/http/widget/context.ts implements for
// video-to-page matching — keep both in lockstep.
import { getUrlPathname } from "../utils";
import { ctx } from "../context";
import type { SlimProduct, StorePayload } from "../types";

export function currentProductUrl(): string {
  return ctx.configuredProductUrl || window.location.href;
}

export function currentExternalProductId(): string {
  if (ctx.configuredProductId) return String(ctx.configuredProductId);
  try {
    if (window.LS && window.LS.product && window.LS.product.id !== undefined && window.LS.product.id !== null) {
      return String(window.LS.product.id);
    }
    if (window.UPZERO_PRODUCT_ID !== undefined && window.UPZERO_PRODUCT_ID !== null) {
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

function normalizePath(value: unknown): string {
  let path = String(value || "/").trim();
  try {
    path = getUrlPathname(path, window.location.origin);
  } catch (_) {}
  path = path.replace(/\/+/g, "/");
  if (path.length > 1) path = path.replace(/\/$/, "");
  return path || "/";
}

export function extractProductHandle(value: unknown): string {
  const path = normalizePath(value);
  const match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

function slugifyForPath(value: unknown): string {
  let text = String(value || "")
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

function firstTextValue(values: unknown[], fallback?: string): string {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback || "";
}

function upzeroReferenceSlugFromProduct(
  product: Record<string, unknown> | null,
  fallbackUrl?: unknown,
): string {
  const candidates = [
    fallbackUrl,
    product && product.product_url,
    product && product.name,
    product && product.title,
    product && product.sku,
    product && product.code,
    product && product.external_id,
  ];
  let numericFallback = "";

  for (const candidate of candidates) {
    const value = String(candidate || "");
    if (!value) continue;
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch (_) {}
    const refMatch = decoded.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9]*)/i);
    if (refMatch && refMatch[1]) {
      return "ref" + refMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
    }
    const compactRefMatch = decoded.match(/\bref(\d+[a-z0-9]*)/i);
    if (compactRefMatch && compactRefMatch[1]) {
      return "ref" + compactRefMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
    }
    // 3+ digits, matching the identical rule in server/sync-products.ts and
    // client/pages/preview/feed.tsx — a shorter numeric string is too likely
    // to be something else entirely (a size, a quantity) to trust as an id.
    const numeric = decoded.match(/^\s*(\d{3,}[a-z0-9]*)\s*$/i);
    if (numeric && numeric[1] && !numericFallback) {
      // No "ref" prefix invented here — a bare numeric id (this store's
      // real, verified-live URL scheme: e.g. "27082-vt-linho-gerlane", no
      // "ref" anywhere) must stay bare or the resulting slug 404s.
      numericFallback = numeric[1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
    }
  }

  return numericFallback;
}

function upzeroProductHandleFromProduct(
  product: Record<string, unknown> | null,
  fallbackUrl?: unknown,
): string {
  const referenceSlug = upzeroReferenceSlugFromProduct(product, fallbackUrl);
  let savedHandle = extractProductHandle(fallbackUrl || (product && product.product_url));
  if (savedHandle) {
    try {
      savedHandle = decodeURIComponent(savedHandle);
    } catch (_) {}
    const savedSlug = slugifyForPath(savedHandle);
    if (savedSlug) {
      if (referenceSlug && savedSlug.indexOf(referenceSlug) !== 0) {
        return referenceSlug + "-" + savedSlug.replace(/^ref\d+-?/, "");
      }
      return savedSlug;
    }
  }

  const nameSlug = slugifyForPath(firstTextValue([product && product.name, product && product.title], ""));
  if (referenceSlug && nameSlug) {
    return referenceSlug + "-" + nameSlug.replace(/^ref\d+-?/, "");
  }
  return referenceSlug || nameSlug;
}

export function repairUpzeroProductUrl(
  productInput: SlimProduct | Record<string, unknown> | null,
  fallbackUrl: string | undefined,
  store: StorePayload | null,
): string {
  const product = productInput as Record<string, unknown> | null;
  const upzeroConfig = ctx.sharedState.upzeroConfig;
  const activeStore = ctx.sharedState.activeStore;
  const url = String(fallbackUrl || (product && product.product_url) || "");
  const base = String(
    (store && (store.url || store.store_url)) ||
      (upzeroConfig && upzeroConfig.storefront_url) ||
      (activeStore && activeStore.url) ||
      window.location.origin,
  );
  const handle = upzeroProductHandleFromProduct(product, url);
  if (!handle) return url;

  try {
    const parsed = new URL(url || base, base);
    // Some storefront templates require a tenant path segment before
    // "/produtos/" (e.g. "/40/produtos/..." — verified live on a shared
    // Upzero template); preserve whatever precedes it in the saved URL
    // rather than assuming "/produtos/" always starts the path.
    const prefixMatch = parsed.pathname.match(/^(.*?)\/produtos?\//i);
    const prefix = prefixMatch ? prefixMatch[1] : "";
    const originalVariantMatch = parsed.pathname.match(/\/produtos?\/[^/]+\/([^/?#]+)/i);
    const existingColorSlug =
      originalVariantMatch && originalVariantMatch[1]
        ? slugifyForPath(decodeURIComponent(originalVariantMatch[1]))
        : "";
    parsed.pathname = prefix + "/produtos/" + handle;
    // Slim server products carry no variants, so only a colour slug already
    // present in the saved URL can be preserved.
    if (existingColorSlug) parsed.pathname += "/" + existingColorSlug;
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch (_) {
    const normalizedBase = String(base || "").replace(/\/$/, "");
    return normalizedBase + "/produtos/" + handle;
  }
}
