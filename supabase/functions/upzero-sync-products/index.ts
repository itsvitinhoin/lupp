import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type Settings = {
  base_url?: string | null;
  integration_name?: string | null;
  last_connection_source?: string | null;
  product_url_pattern?: string | null;
  storefront_url?: string | null;
};

type StorefrontProductItem = {
  image_groups?: unknown;
  product_image_variant_map?: unknown;
  product?: {
    id?: number | string;
    code?: string | null;
    description?: string | null;
    name?: string;
    slug?: string | null;
    card_data?: {
      cover_image_url?: string | null;
      price_cents?: number | null;
      promo_cents?: number | null;
    };
  };
  variants?: Array<{
    attribute_values?: unknown;
    attributes?: unknown;
    images?: Array<string | Record<string, unknown>>;
    variant?: {
      active?: boolean | null;
      id?: number | string | null;
      sku?: string | null;
      stock_qty?: number | null;
      asset_id?: number | string | null;
      image_key?: string | null;
      price_cents?: number | null;
      promo_cents?: number | null;
      attributes?: unknown;
    };
  }>;
};

type ExternalProduct = {
  id?: string;
  product_id?: string;
  code?: string | null;
  description_html?: string | null;
  name?: string;
  status?: string;
  images?: Array<string | Record<string, unknown>>;
  variants?: Array<{
    id?: string | number | null;
    product_variant_id?: string | number | null;
    variant_id?: string | number | null;
    external_id?: string | number | null;
    active?: boolean | null;
    sku?: string | null;
    images?: Array<string | Record<string, unknown>>;
    price?: string | number | null;
    promotional_price?: string | number | null;
    stock_qty?: number | null;
    attributes?: unknown;
  }>;
};

type PublicStorefrontProduct = {
  colors?: Array<{
    color?: string | null;
    hoverImageUrl?: string | null;
    imageUrl?: string | null;
    name?: string | null;
    swatchImageUrl?: string | null;
  }>;
  hoverImageUrl?: string | null;
  id?: string | number | null;
  imageUrl?: string | null;
  name?: string | null;
  originalPrice?: string | number | null;
  price?: string | number | null;
  promoPrice?: string | number | null;
  sizes?: Array<string | number>;
  sku?: string | null;
  slug?: string | null;
};

type PublicStorefrontProductDetail = {
  colors?: Array<{
    available?: Record<string, boolean>;
    color?: string | null;
    images?: Array<string | Record<string, unknown>>;
    maxQtyBySize?: Record<string, number>;
    name?: string | null;
    swatchImageUrl?: string | null;
    variantBySize?: Record<string, number | null>;
  }>;
  images?: Array<string | Record<string, unknown>>;
  name?: string | null;
  numericId?: number | string | null;
  originalPrice?: string | number | null;
  price?: string | number | null;
  promoPrice?: string | number | null;
  shortDescription?: string | null;
  sizes?: Array<string | number>;
  sku?: string | null;
};

type SyncAttempt = {
  details: Record<string, unknown>;
  source: string;
  status: number;
};

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DETAIL_FETCH_TIMEOUT_MS = 3_500;

async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeBaseUrl(value: string | null | undefined) {
  const raw = String(value || "https://api.upzero.com.br")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  return raw;
}

function numericPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function numericInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function centsToPrice(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed / 100 : null;
}

function minPrice(values: Array<number | null>) {
  const valid = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return valid.length ? Math.min(...valid) : null;
}

function slugify(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function upzeroReferenceSlug(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const refMatch = raw.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9-]*)/i);
  if (refMatch?.[1]) return `ref${slugify(refMatch[1])}`;
  const numericMatch = raw.match(/\b(\d{3,}[a-z0-9-]*)\b/i);
  if (numericMatch?.[1]) return `ref${slugify(numericMatch[1])}`;
  return slugify(raw.replace(/^ref\s*[:#-]?\s*/i, "ref"));
}

function upzeroProductSlug(product: {
  code?: string | null;
  id?: string | number | null;
  name?: string | null;
  slug?: string | null;
}) {
  const nameSlug = slugify(product.name);
  const referenceSlug = upzeroReferenceSlug(
    product.slug || product.code || product.id || product.name,
  );
  if (referenceSlug && nameSlug) return `${referenceSlug}-${nameSlug}`;
  return referenceSlug || nameSlug || slugify(product.slug || product.code || product.id);
}

function buildProductUrl(
  storefrontUrl: string | null | undefined,
  pattern: string | null | undefined,
  product: {
    code?: string | null;
    id?: string | number | null;
    name?: string | null;
    slug?: string | null;
  },
) {
  const base = String(storefrontUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;
  const slug = product.slug || product.code || product.id;
  if (!slug) return null;
  const nameSlug = slugify(product.name);
  const referenceSlug = upzeroReferenceSlug(product.slug || product.code || product.id);
  const productSlug = upzeroProductSlug(product);
  const rawPattern = String(pattern || "/produtos/{code}-{name_slug}").trim();
  const normalizedPattern = /^\/?produto\/\{(?:slug|code|id)\}\/?$/i.test(
    rawPattern,
  )
    ? "/produtos/{code}-{name_slug}"
    : rawPattern;
  const path = normalizedPattern
    .replace(/\{slug\}/g, encodeURIComponent(productSlug || String(slug)))
    .replace(/\{name_slug\}/g, encodeURIComponent(nameSlug || productSlug || String(slug)))
    .replace(
      /\{product_slug\}/g,
      encodeURIComponent(productSlug || String(slug)),
    )
    .replace(/\{code\}/g, encodeURIComponent(referenceSlug || productSlug || String(product.code || slug)))
    .replace(/\{id\}/g, encodeURIComponent(String(product.id || slug)));
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function productUrlHandle(
  storefrontUrl: string | null | undefined,
  pattern: string | null | undefined,
  product: {
    code?: string | null;
    id?: string | number | null;
    name?: string | null;
    slug?: string | null;
  },
) {
  const productUrl = buildProductUrl(storefrontUrl, pattern, product);
  if (!productUrl) return "";
  try {
    const path = new URL(productUrl).pathname;
    const match = path.match(
      /\/(?:produto|produtos|product|products)\/([^/]+)/i,
    );
    return match ? decodeURIComponent(match[1]) : "";
  } catch (_) {
    return "";
  }
}

function imageValue(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = imageValue(item);
      if (candidate) return candidate;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "url",
    "src",
    "image",
    "image_url",
    "imageUrl",
    "cover",
    "cover_url",
    "coverUrl",
    "cover_image",
    "cover_image_url",
    "coverImageUrl",
    "thumbnail",
    "thumbnail_url",
    "thumbnailUrl",
    "thumb",
    "thumb_url",
    "photo",
    "photo_url",
    "picture",
    "picture_url",
    "file",
    "file_url",
    "fileUrl",
    "path",
    "original",
    "large",
    "medium",
    "small",
  ];
  for (const key of candidateKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (candidate && typeof candidate === "object") {
      const nestedCandidate = imageValue(candidate);
      if (nestedCandidate) return nestedCandidate;
    }
  }

  const nestedKeys = [
    "data",
    "items",
    "attributes",
    "image",
    "images",
    "cover",
    "thumbnail",
    "photo",
    "photos",
    "picture",
    "file",
    "gallery",
    "media",
    "assets",
    "urls",
    "formats",
    "variants",
  ];
  for (const key of nestedKeys) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const candidate = imageValue(nested);
      if (candidate) return candidate;
    }
  }

  return null;
}

function imageValues(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map(imageValue)
    .filter((value): value is string => Boolean(value));
}

function normalizeImageUrl(value: unknown, settings: Settings) {
  const raw = imageValue(value)?.trim();
  if (!raw) return null;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = String(settings.storefront_url || settings.base_url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return raw;
  try {
    return new URL(raw, `${base}/`).href;
  } catch (_) {
    return raw;
  }
}

function firstImageUrl(settings: Settings, ...sources: unknown[]) {
  for (const source of sources) {
    const candidates = Array.isArray(source)
      ? imageValues(source)
      : [imageValue(source)].filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate, settings);
      if (normalized) return normalized;
    }
  }
  return null;
}

function publicStorefrontProductUrl(
  settings: Settings,
  product: PublicStorefrontProduct,
) {
  const base = String(settings.storefront_url || "")
    .trim()
    .replace(/\/+$/, "");
  const slug = upzeroProductSlug({
    code: product.sku || null,
    id: product.id || null,
    name: product.name || null,
    slug: product.slug || null,
  })
    .trim()
    .replace(/^\/+/, "");
  if (!base || !slug) return null;
  const firstColorSlug = slugify(
    product.colors?.find((color) => String(color?.name || "").trim())?.name ||
      "",
  );
  const path = `/produtos/${slug}${firstColorSlug ? `/${firstColorSlug}` : ""}`;
  try {
    return new URL(path, `${base}/`).href;
  } catch (_) {
    return `${base}${path}`;
  }
}

function decodeJsonEscapes(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch (_) {
    return value;
  }
}

function decodePublicStorefrontHtml(html: string) {
  return html.replace(/\\"/g, '"').replace(/\\\//g, "/");
}

function extractJsonArraysByKey(text: string, key: string) {
  const arrays: string[] = [];
  const marker = `"${key}":[`;
  let position = 0;

  while ((position = text.indexOf(marker, position)) !== -1) {
    const start = position + marker.length - 1;
    let depth = 0;
    let escaped = false;
    let inString = false;
    let closed = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "[") depth += 1;
      if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          arrays.push(text.slice(start, index + 1));
          position = index + 1;
          closed = true;
          break;
        }
      }
    }

    if (!closed) position += marker.length;
  }

  return arrays;
}

function parsePublicStorefrontProducts(html: string) {
  const decoded = decodePublicStorefrontHtml(html);
  const products: PublicStorefrontProduct[] = [];

  for (const rawArray of extractJsonArraysByKey(decoded, "products")) {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(rawArray);
    } catch (_) {
      parsed = [];
    }
    if (!Array.isArray(parsed)) continue;
    products.push(
      ...parsed.filter((product): product is PublicStorefrontProduct =>
        Boolean(
          product &&
          typeof product === "object" &&
          !Array.isArray(product) &&
          (product as PublicStorefrontProduct).id &&
          (product as PublicStorefrontProduct).name,
        ),
      ),
    );
  }

  return products;
}

function publicStorefrontProductPaths(html: string) {
  const decoded = decodePublicStorefrontHtml(html);
  const paths = new Set<string>(["/", "/produtos"]);
  for (const match of decoded.matchAll(/"href":"([^"#]+)"/g)) {
    const path = decodeJsonEscapes(match[1]);
    if (path.startsWith("/produtos")) paths.add(path);
  }
  return [...paths].slice(0, 12);
}

function publicStorefrontStoreId(html: string) {
  const decoded = decodePublicStorefrontHtml(html);
  const match = decoded.match(/"storeId":(\d+)/);
  return match?.[1] || null;
}

function parseServerActionLine<T>(text: string, id = "1") {
  const prefix = `${id}:`;
  const line = text
    .split(/\n/)
    .find(
      (item) => item.startsWith(prefix) && item.slice(prefix.length).trim(),
    );
  if (!line) return null;
  try {
    return JSON.parse(line.slice(prefix.length)) as T;
  } catch (_) {
    return null;
  }
}

async function fetchPublicStorefrontProductDetail(
  settings: Settings,
  publicStoreId: string | null,
  product: PublicStorefrontProduct,
) {
  const base = String(settings.storefront_url || "")
    .trim()
    .replace(/\/+$/, "");
  const slugOrId = String(product.slug || product.id || "").trim();
  if (!base || !publicStoreId || !slugOrId) return null;

  try {
    const url = publicStorefrontProductUrl(settings, product) || `${base}/`;
    const response = await fetchWithTimeout(
      url,
      {
        body: JSON.stringify([
          { slugOrId, storeId: Number(publicStoreId) || publicStoreId },
        ]),
        headers: {
          Accept: "text/x-component",
          "Content-Type": "text/plain;charset=UTF-8",
          "Next-Action": "4090e9a543114e51269eb379b5cf3c4361075ca9b1",
          "User-Agent": "Luup Product Sync",
        },
        method: "POST",
      },
      DETAIL_FETCH_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const payload = parseServerActionLine<{
      ok?: boolean;
      product?: PublicStorefrontProductDetail;
    }>(await response.text());
    return payload?.ok && payload.product ? payload.product : null;
  } catch (_) {
    return null;
  }
}

async function fetchPublicStorefrontProductDetails(
  settings: Settings,
  publicStoreId: string | null,
  products: PublicStorefrontProduct[],
) {
  const details = new Map<string, PublicStorefrontProductDetail>();
  if (!publicStoreId || !products.length) return details;

  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < products.length) {
      const index = cursor;
      cursor += 1;
      const product = products[index];
      const externalId = String(product.id || "").trim();
      if (!externalId) continue;
      const detail = await fetchPublicStorefrontProductDetail(
        settings,
        publicStoreId,
        product,
      );
      if (detail) details.set(externalId, detail);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, products.length) }, () =>
      worker(),
    ),
  );
  return details;
}

function dedupePublicStorefrontProducts(products: PublicStorefrontProduct[]) {
  const byId = new Map<string, PublicStorefrontProduct>();
  for (const product of products) {
    const id = String(product.id || "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, product);
  }
  return [...byId.values()];
}

async function fetchPublicStorefrontCatalogProducts(
  base: string,
  storeId: string,
) {
  const products: PublicStorefrontProduct[] = [];
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, 20); page += 1) {
    const url = new URL("/api/storefront/catalog", `${base}/`);
    url.searchParams.set("storeId", storeId);
    url.searchParams.set("mode", "products");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "100");

    const response = await fetchWithTimeout(url.href, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Luup Product Sync",
      },
    });
    if (!response.ok) break;

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (Array.isArray(payload.products)) {
      products.push(
        ...(payload.products.filter(
          (product): product is PublicStorefrontProduct =>
            Boolean(
              product &&
              typeof product === "object" &&
              !Array.isArray(product) &&
              (product as PublicStorefrontProduct).id &&
              (product as PublicStorefrontProduct).name,
            ),
        ) as PublicStorefrontProduct[]),
      );
    }

    const pagination =
      payload.pagination &&
      typeof payload.pagination === "object" &&
      !Array.isArray(payload.pagination)
        ? (payload.pagination as Record<string, unknown>)
        : {};
    const parsedTotalPages = Number(pagination.totalPages);
    totalPages =
      Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
        ? Math.min(Math.trunc(parsedTotalPages), 20)
        : totalPages;
  }

  return products;
}

async function fetchPublicStorefrontProducts(settings: Settings) {
  const base = String(settings.storefront_url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base)
    return {
      pages: 0,
      products: [] as PublicStorefrontProduct[],
      publicStoreId: null,
    };

  const firstResponse = await fetchWithTimeout(`${base}/`, {
    headers: { Accept: "text/html", "User-Agent": "Luup Product Sync" },
  });
  if (!firstResponse.ok) {
    return {
      pages: 0,
      products: [] as PublicStorefrontProduct[],
      publicStoreId: null,
    };
  }

  const firstHtml = await firstResponse.text();
  const paths = publicStorefrontProductPaths(firstHtml);
  const publicStoreId = publicStorefrontStoreId(firstHtml);
  const products = publicStoreId
    ? await fetchPublicStorefrontCatalogProducts(base, publicStoreId)
    : [];
  products.push(...parsePublicStorefrontProducts(firstHtml));
  let pages = 1;

  for (const path of paths.filter((item) => item !== "/")) {
    try {
      const url = new URL(path, `${base}/`).href;
      const response = await fetchWithTimeout(url, {
        headers: { Accept: "text/html", "User-Agent": "Luup Product Sync" },
      });
      if (!response.ok) continue;
      pages += 1;
      products.push(...parsePublicStorefrontProducts(await response.text()));
    } catch (_) {
      continue;
    }
  }

  return {
    pages,
    products: dedupePublicStorefrontProducts(products),
    publicStoreId,
  };
}

function publicStorefrontRows(
  products: PublicStorefrontProduct[],
  storeId: string,
  settings: Settings,
  details = new Map<string, PublicStorefrontProductDetail>(),
) {
  return products
    .map((product) => {
      const externalId = String(product.id || "").trim();
      if (!externalId || !product.name) return null;
      const detail = details.get(externalId);
      const promoPrice = numericPrice(product.promoPrice);
      const detailPromoPrice = numericPrice(detail?.promoPrice);
      const currentPrice =
        detailPromoPrice ??
        promoPrice ??
        numericPrice(detail?.price) ??
        numericPrice(product.price);
      const originalPrice =
        numericPrice(detail?.originalPrice) ??
        numericPrice(product.originalPrice);
      return {
        compare_at_price:
          originalPrice && currentPrice && originalPrice > currentPrice
            ? originalPrice
            : null,
        currency: "BRL",
        description: detail?.shortDescription || null,
        external_id: externalId,
        image_url: firstImageUrl(
          settings,
          detail?.images,
          product.imageUrl,
          product.hoverImageUrl,
          product.colors?.map((color) => color.imageUrl),
        ),
        name: product.name,
        platform: "upzero",
        price: currentPrice,
        product_url: publicStorefrontProductUrl(settings, product),
        status: "active",
        store_id: storeId,
      };
    })
    .filter(Boolean);
}

function publicStorefrontVariantRows(
  products: PublicStorefrontProduct[],
  storeId: string,
  settings: Settings,
  details = new Map<string, PublicStorefrontProductDetail>(),
) {
  return products.flatMap((product) => {
    const productExternalId = String(product.id || "").trim();
    if (!productExternalId) return [];
    const detail = details.get(productExternalId);
    if (detail?.colors?.length) {
      const promoPrice = numericPrice(detail.promoPrice);
      const currentPrice =
        promoPrice ?? numericPrice(detail.price) ?? numericPrice(product.price);
      const originalPrice =
        numericPrice(detail.originalPrice) ??
        numericPrice(product.originalPrice);

      return detail.colors.flatMap((color, colorIndex) => {
        const colorName = String(color.name || "").trim();
        const colorCode = slugify(colorName || `cor-${colorIndex + 1}`);
        const sizes =
          Array.isArray(detail.sizes) && detail.sizes.length
            ? detail.sizes.map((size) => String(size))
            : Object.keys(color.variantBySize || {});

        return sizes
          .map((size) => {
            const sizeName = String(size || "").trim();
            const sizeCode = slugify(sizeName || "unico");
            const variantId = numericInteger(color.variantBySize?.[sizeName]);
            if (!variantId || variantId <= 0) return null;
            const available = Boolean(color.available?.[sizeName]);
            const maxQty = numericInteger(color.maxQtyBySize?.[sizeName]);
            return {
              asset_id: null,
              color_code: colorCode || null,
              color_hex:
                typeof color.color === "string" && color.color.startsWith("#")
                  ? color.color
                  : null,
              color_name: colorName || null,
              compare_at_price:
                originalPrice && currentPrice && originalPrice > currentPrice
                  ? originalPrice
                  : null,
              external_id: String(variantId),
              image_url:
                firstImageUrl(
                  settings,
                  color.images,
                  detail.images,
                  product.imageUrl,
                ) ?? null,
              metadata: {
                color_index: colorIndex,
                size_index: sizes.indexOf(size),
                source: "upzero_storefront_product_action",
              },
              platform: "upzero",
              price: currentPrice,
              product_external_id: productExternalId,
              size_code: sizeCode || null,
              size_name: sizeName || null,
              sku:
                typeof detail.sku === "string" && detail.sku.trim()
                  ? detail.sku
                  : typeof product.sku === "string" && product.sku.trim()
                    ? product.sku
                    : null,
              status: available ? "active" : "archived",
              stock_qty: available ? maxQty : 0,
              store_id: storeId,
            };
          })
          .filter(Boolean);
      });
    }

    return [];
  });
}

async function publicStorefrontSyncRows(storeId: string, settings: Settings) {
  const { pages, products, publicStoreId } =
    await fetchPublicStorefrontProducts(settings);
  const details = await fetchPublicStorefrontProductDetails(
    settings,
    publicStoreId,
    products,
  );
  return {
    pages,
    productRows: publicStorefrontRows(products, storeId, settings, details),
    products,
    variantRows: publicStorefrontVariantRows(
      products,
      storeId,
      settings,
      details,
    ),
    detailEnrichedCount: details.size,
  };
}

function hasUsableUpzeroVariantRows(rows: Array<Record<string, unknown>>) {
  return rows.some((row) => {
    const externalId = String(row.external_id || "");
    return (
      externalId &&
      !externalId.includes(":") &&
      row.status === "active" &&
      Boolean(row.color_name || row.size_name || row.asset_id)
    );
  });
}

function imageGroupImages(imageGroups: unknown, imageKey?: string | null) {
  if (!Array.isArray(imageGroups)) return [];
  const groups = imageGroups.filter((group) => {
    if (!imageKey) return true;
    if (!group || typeof group !== "object" || Array.isArray(group))
      return false;
    const record = group as Record<string, unknown>;
    return (
      String(record.image_key || record.variant_image_key || "") ===
      String(imageKey)
    );
  });
  return groups.flatMap((group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) return [];
    const record = group as Record<string, unknown>;
    return Array.isArray(record.images) ? record.images : [record];
  });
}

function firstImageGroupImages(imageGroups: unknown) {
  if (!Array.isArray(imageGroups)) return [];
  const first = imageGroups.find(
    (group) => group && typeof group === "object" && !Array.isArray(group),
  );
  if (!first || typeof first !== "object" || Array.isArray(first)) return [];
  const record = first as Record<string, unknown>;
  return Array.isArray(record.images) ? record.images : [record];
}

function imageGroupSkuGroups(imageGroups: unknown) {
  if (!Array.isArray(imageGroups)) return [];
  return imageGroups.flatMap((group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) return [];
    const record = group as Record<string, unknown>;
    const parentImageKey = record.image_key || record.variant_image_key || null;
    const parentImages = Array.isArray(record.images) ? record.images : [];
    const skuGroups = Array.isArray(record.sku_groups) ? record.sku_groups : [];
    return skuGroups
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({
        ...item,
        image_key: item.image_key || parentImageKey,
        images:
          Array.isArray(item.images) && item.images.length
            ? item.images
            : parentImages,
      }));
  });
}

function findSkuGroupForVariant(
  imageGroups: unknown,
  externalId: string,
  sku?: string | null,
) {
  const normalizedSku = String(sku || "").trim();
  return (
    imageGroupSkuGroups(imageGroups).find((group) => {
      const groupVariantId = String(
        group.product_variant_id || group.variant_id || "",
      );
      const groupSku = String(group.sku || "").trim();
      return (
        (externalId && groupVariantId === externalId) ||
        (normalizedSku && groupSku === normalizedSku)
      );
    }) || null
  );
}

function normalizeProductImageGroups(value: unknown) {
  const items =
    value && typeof value === "object" && !Array.isArray(value)
      ? Array.isArray((value as Record<string, unknown>).items)
        ? ((value as Record<string, unknown>).items as unknown[])
        : []
      : Array.isArray(value)
        ? value
        : [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const images = Array.isArray(record.images) ? record.images : [];
      const primaryImage = record.primary_image_url
        ? [{ image_url: record.primary_image_url }]
        : [];
      return {
        image_key: record.image_key || record.variant_image_key || null,
        images: [...primaryImage, ...images],
        sku_groups: Array.isArray(record.sku_groups) ? record.sku_groups : [],
      };
    })
    .filter(Boolean);
}

async function fetchStorefrontProductImages(
  baseUrl: string,
  headers: Record<string, string>,
  productId: unknown,
) {
  const parsedProductId = Number(productId);
  if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) return [];

  const url = new URL(`${baseUrl}/v1/product-images`);
  url.searchParams.set("product_id", String(Math.trunc(parsedProductId)));
  url.searchParams.set("limit", "200");

  const response = await fetchWithTimeout(url, { headers });
  if (!response.ok) return [];
  return normalizeProductImageGroups(await readJson(response));
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function storefrontProductFromDataPayload(
  payload: Record<string, unknown>,
  fallback: StorefrontProductItem,
) {
  const payloadRoot =
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : payload;
  const rawProduct = payloadRoot.product;
  const productContainer =
    rawProduct && typeof rawProduct === "object" && !Array.isArray(rawProduct)
      ? (rawProduct as Record<string, unknown>)
      : {};
  const nestedProduct =
    productContainer.product &&
    typeof productContainer.product === "object" &&
    !Array.isArray(productContainer.product)
      ? (productContainer.product as Record<string, unknown>)
      : productContainer;
  return {
    ...fallback,
    image_groups: payloadRoot.image_groups,
    product: {
      ...(fallback.product || {}),
      ...nestedProduct,
    },
    product_image_variant_map: payloadRoot.product_image_variant_map,
    variants: Array.isArray(payloadRoot.variants)
      ? (payloadRoot.variants as StorefrontProductItem["variants"])
      : fallback.variants,
  };
}

function storefrontVariantHasUsefulDetails(variantItem: unknown) {
  if (!variantItem || typeof variantItem !== "object" || Array.isArray(variantItem)) {
    return false;
  }
  const variantItemRecord = variantItem as Record<string, unknown>;
  const variant =
    variantItemRecord.variant &&
    typeof variantItemRecord.variant === "object" &&
    !Array.isArray(variantItemRecord.variant)
      ? (variantItemRecord.variant as Record<string, unknown>)
      : {};
  const attributes = [
    ...normalizeAttributeItems(variantItemRecord.attribute_values),
    ...normalizeAttributeItems(variantItemRecord.attributes),
    ...normalizeAttributeItems(variantItemRecord.options),
    ...normalizeAttributeItems(variantItemRecord.option_values),
    ...normalizeAttributeItems(variantItemRecord.values),
    ...normalizeAttributeItems(variantItemRecord.properties),
    ...normalizeAttributeItems(variant.attributes),
    ...normalizeAttributeItems(variant.options),
    ...normalizeAttributeItems(variant.option_values),
    ...normalizeAttributeItems(variant.values),
    ...normalizeAttributeItems(variant.properties),
  ];
  if (findVariantAttribute(attributes, "color") || findVariantAttribute(attributes, "size")) {
    return true;
  }
  const records = [variantItemRecord, variant];
  return Boolean(
    directVariantValue(records, ["color_name", "colorName", "color", "cor", "colour"]) ||
      directVariantValue(records, ["size_name", "sizeName", "size", "tamanho", "tam"]) ||
      variantCombinationParts(variantItemRecord, variant).filter(Boolean).length,
  );
}

async function fetchStorefrontProductDetails(
  baseUrl: string,
  headers: Record<string, string>,
  settings: Settings,
  item: StorefrontProductItem,
) {
  const product = item.product || {};
  const imageGroups = await fetchStorefrontProductImages(
    baseUrl,
    headers,
    product.id,
  ).catch(() => []);
  const candidates = [
    product.slug,
    productUrlHandle(settings.storefront_url, settings.product_url_pattern, {
      ...product,
      name: product.name,
    }),
    product.code && product.name
      ? `${product.code}-${slugify(product.name)}`
      : "",
    product.code,
    product.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const seen = new Set<string>();

  for (const slug of candidates) {
    const normalizedSlug = slug.replace(/^\/+|\/+$/g, "");
    if (!normalizedSlug || seen.has(normalizedSlug)) continue;
    seen.add(normalizedSlug);

    const url = new URL(
      `${baseUrl}/v1/product/data/${encodeURIComponent(normalizedSlug)}`,
    );
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) continue;
    const payload = await readJson(response);
    const enriched = storefrontProductFromDataPayload(payload, {
      ...item,
      image_groups: imageGroups.length
        ? imageGroups
        : (item as Record<string, unknown>).image_groups,
    });
    if (
      Array.isArray(enriched.variants) &&
      enriched.variants.some((variant) => storefrontVariantHasUsefulDetails(variant))
    ) {
      return enriched;
    }
    if (Array.isArray((enriched as Record<string, unknown>).image_groups)) {
      return enriched;
    }
  }

  return imageGroups.length ? { ...item, image_groups: imageGroups } : item;
}

async function enrichStorefrontItemsWithDetails(
  baseUrl: string,
  headers: Record<string, string>,
  settings: Settings,
  items: StorefrontProductItem[],
) {
  const enriched: StorefrontProductItem[] = [];
  const batchSize = 8;
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map((item) =>
        fetchStorefrontProductDetails(baseUrl, headers, settings, item).catch(
          () => item,
        ),
      ),
    );
    enriched.push(...results);
  }
  return enriched;
}

function productKey(row: Record<string, unknown>) {
  const platform = String(row.platform || "upzero");
  const externalId = String(row.external_id || "");
  return externalId ? `${platform}:${externalId}` : "";
}

function dedupeProducts(rows: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const key = productKey(row);
    if (!key) continue;
    byKey.set(key, row);
  }

  return Array.from(byKey.values());
}

function dedupeVariants(rows: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const platform = String(row.platform || "upzero");
    const externalId = String(row.external_id || "");
    if (!externalId) continue;
    byKey.set(`${platform}:${externalId}`, row);
  }

  return Array.from(byKey.values());
}

function normalizeAttributeItems(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        attribute_code: key,
        ...(item as Record<string, unknown>),
      };
    }
    return {
      attribute_code: key,
      value_code: item,
      value_name: item,
    };
  });
}

function attributeCode(item: Record<string, unknown>) {
  return String(
    item.attribute_code ??
      item.attributeCode ??
      item.code ??
      item.attribute ??
      item.name ??
      "",
  ).toLowerCase();
}

function attributeName(item: Record<string, unknown>) {
  return String(
    item.attribute_name ??
      item.attributeName ??
      item.name ??
      item.label ??
      item.attribute_code ??
      "",
  ).toLowerCase();
}

function attributeValueName(item: Record<string, unknown>) {
  return String(
    item.value_name ??
      item.valueName ??
      item.term_name ??
      item.termName ??
      item.name ??
      item.label ??
      item.value ??
      "",
  ).trim();
}

function attributeValueCode(item: Record<string, unknown>) {
  return String(
    item.value_code ??
      item.valueCode ??
      item.term_code ??
      item.termCode ??
      item.code ??
      item.slug ??
      item.value ??
      "",
  ).trim();
}

function attributeHex(item: Record<string, unknown>) {
  const meta = item.value_meta ?? item.valueMeta ?? item.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const candidate = (meta as Record<string, unknown>).hex;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  const candidate = item.hex ?? item.color_hex ?? item.colorHex;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function findVariantAttribute(
  attributes: Array<Record<string, unknown>>,
  kind: "color" | "size",
) {
  const codeMatches =
    kind === "color" ? ["color", "cor", "colour"] : ["size", "tamanho", "tam"];
  return (
    attributes.find((item) => codeMatches.includes(attributeCode(item))) ??
    attributes.find((item) =>
      codeMatches.some((candidate) => attributeName(item).includes(candidate)),
    ) ??
    null
  );
}

function directVariantValue(
  records: Array<Record<string, unknown>>,
  keys: string[],
) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "object") {
        const nested = attributeValueName(value as Record<string, unknown>);
        if (nested) return nested;
        continue;
      }
      const normalized = humanizeAttributeFallback(value);
      if (normalized) return normalized;
    }
  }
  return "";
}

function directVariantCode(
  records: Array<Record<string, unknown>>,
  keys: string[],
) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "object") {
        const nested = attributeValueCode(value as Record<string, unknown>);
        if (nested) return nested;
        continue;
      }
      const normalized = String(value || "").trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

function directVariantHex(records: Array<Record<string, unknown>>) {
  const keys = ["color_hex", "colorHex", "hex", "swatch_hex", "swatchHex"];
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function humanizeAttributeFallback(value: unknown) {
  const raw = String(value || "")
    .trim()
    .replace(/\|/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (!raw || /^(produto|unico|unique|null|undefined)$/i.test(raw)) return "";
  return raw.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function variantCombinationParts(
  variantItem: Record<string, unknown>,
  variant: Record<string, unknown>,
) {
  const combination = String(
    variantItem.combination_key ||
      variantItem.variant_combination_key ||
      variant.combination_key ||
      variant.variant_combination_key ||
      "",
  ).trim();
  return combination
    ? combination.split("|").map((part) => humanizeAttributeFallback(part))
    : [];
}

function sizeFromSku(value: unknown) {
  const tokens = String(value || "")
    .split(/[-_\s|]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  const knownSizes = new Set([
    "PP",
    "P",
    "M",
    "G",
    "GG",
    "XG",
    "XGG",
    "U",
    "UN",
    "UNICO",
    "ÚNICO",
  ]);
  const candidate = [...tokens]
    .reverse()
    .find((token) => knownSizes.has(token));
  if (!candidate) return "";
  return candidate === "UNICO" ? "Unico" : candidate;
}

function variantExternalId(variant: Record<string, unknown>) {
  const candidate =
    variant.product_variant_id ??
    variant.variant_id ??
    variant.external_id ??
    variant.id;
  return candidate === undefined || candidate === null ? "" : String(candidate);
}

async function saveVariants(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  rows: Array<Record<string, unknown>>,
) {
  const uniqueRows = dedupeVariants(rows);
  if (!uniqueRows.length) return { total: 0 };

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, external_id")
    .eq("store_id", storeId)
    .eq("platform", "upzero");

  if (productsError) return { error: productsError, total: uniqueRows.length };

  const productsByExternalId = new Map<string, string>();
  for (const product of products || []) {
    if (product.external_id && product.id) {
      productsByExternalId.set(String(product.external_id), String(product.id));
    }
  }

  const rowsToUpsert = uniqueRows
    .map((row) => {
      const productId = productsByExternalId.get(
        String(row.product_external_id || ""),
      );
      if (!productId) return null;
      const { product_external_id: _productExternalId, ...variantRow } = row;
      return {
        ...variantRow,
        product_id: productId,
        store_id: storeId,
      };
    })
    .filter(Boolean);

  if (!rowsToUpsert.length) return { total: 0 };

  const touchedProductIds = [
    ...new Set(
      rowsToUpsert.map((row) => String(row.product_id || "")).filter(Boolean),
    ),
  ];

  if (touchedProductIds.length) {
    const { error: staleError } = await supabase
      .from("product_variants")
      .update({ status: "archived", stock_qty: 0 })
      .eq("store_id", storeId)
      .eq("platform", "upzero")
      .in("product_id", touchedProductIds);

    if (staleError) return { error: staleError, total: rowsToUpsert.length };
  }

  const { error: upsertError } = await supabase
    .from("product_variants")
    .upsert(rowsToUpsert, { onConflict: "store_id,platform,external_id" });

  if (upsertError) return { error: upsertError, total: rowsToUpsert.length };

  return { total: rowsToUpsert.length };
}

async function saveProducts(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  rows: Array<Record<string, unknown>>,
) {
  const uniqueRows = dedupeProducts(rows);
  if (!uniqueRows.length) return { inserted: 0, total: 0, updated: 0 };

  const { data: existingProducts, error: existingError } = await supabase
    .from("products")
    .select("id, external_id, image_url, platform")
    .eq("store_id", storeId)
    .eq("platform", "upzero");

  if (existingError) {
    return {
      error: existingError,
      inserted: 0,
      total: uniqueRows.length,
      updated: 0,
    };
  }

  const existingByKey = new Map<
    string,
    { id: string; image_url?: string | null }
  >();
  for (const product of existingProducts || []) {
    const key = productKey(product as Record<string, unknown>);
    if (key && typeof product.id === "string")
      existingByKey.set(key, {
        id: product.id,
        image_url:
          typeof product.image_url === "string" && product.image_url.trim()
            ? product.image_url
            : null,
      });
  }

  const rowsToInsert: Array<Record<string, unknown>> = [];
  let updated = 0;

  for (const row of uniqueRows) {
    const existing = existingByKey.get(productKey(row));
    if (!existing) {
      rowsToInsert.push(row);
      continue;
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({
        compare_at_price: row.compare_at_price ?? null,
        currency: row.currency || "BRL",
        description: row.description ?? null,
        image_url: row.image_url ?? existing.image_url ?? null,
        name: row.name,
        price: row.price ?? null,
        product_url: row.product_url ?? null,
        status: row.status || "active",
      })
      .eq("id", existing.id);

    if (updateError) {
      return {
        error: updateError,
        inserted: 0,
        total: uniqueRows.length,
        updated,
      };
    }

    updated += 1;
  }

  if (rowsToInsert.length) {
    const { error: insertError } = await supabase
      .from("products")
      .insert(rowsToInsert);
    if (insertError) {
      return {
        error: insertError,
        inserted: 0,
        total: uniqueRows.length,
        updated,
      };
    }
  }

  return { inserted: rowsToInsert.length, total: uniqueRows.length, updated };
}

function storefrontRows(
  items: StorefrontProductItem[],
  storeId: string,
  settings: Settings,
) {
  return items
    .map((item) => {
      const product = item.product || {};
      const variants = Array.isArray(item.variants) ? item.variants : [];
      const activeVariants = variants.filter(
        (variant) => variant.variant?.active !== false,
      );
      const variantSet = activeVariants.length ? activeVariants : variants;
      const promoPrice = minPrice(
        variantSet.map((variant) => centsToPrice(variant.variant?.promo_cents)),
      );
      const basePrice =
        centsToPrice(product.card_data?.price_cents) ??
        minPrice(
          variantSet.map((variant) =>
            centsToPrice(variant.variant?.price_cents),
          ),
        );
      const price =
        centsToPrice(product.card_data?.promo_cents) ?? promoPrice ?? basePrice;
      const imageUrl = firstImageUrl(
        settings,
        product.card_data?.cover_image_url,
        product.card_data,
        imageGroupImages((item as Record<string, unknown>).image_groups),
        firstImageGroupImages((item as Record<string, unknown>).image_groups),
        (product as Record<string, unknown>).cover_image_url,
        (product as Record<string, unknown>).image_url,
        (product as Record<string, unknown>).thumbnail_url,
        (product as Record<string, unknown>).image,
        (product as Record<string, unknown>).images,
        (product as Record<string, unknown>).media,
        (product as Record<string, unknown>).photos,
        variantSet.flatMap((variant) => variant.images || []),
      );
      const externalId =
        product.id === undefined || product.id === null
          ? null
          : String(product.id);
      if (!externalId || !product.name) return null;

      return {
        compare_at_price:
          promoPrice && basePrice && promoPrice < basePrice ? basePrice : null,
        currency: "BRL",
        description: product.description || null,
        external_id: externalId,
        image_url: imageUrl,
        name: product.name,
        platform: "upzero",
        price,
        product_url: buildProductUrl(
          settings.storefront_url,
          settings.product_url_pattern,
          { ...product, name: product.name },
        ),
        status: "active",
        store_id: storeId,
      };
    })
    .filter(Boolean);
}

function storefrontVariantRows(
  items: StorefrontProductItem[],
  storeId: string,
  settings: Settings,
) {
  return items.flatMap((item) => {
    const product = item.product || {};
    const productExternalId =
      product.id === undefined || product.id === null ? "" : String(product.id);
    if (!productExternalId) return [];

    const productImageUrl = firstImageUrl(
      settings,
      product.card_data?.cover_image_url,
      product.card_data,
      imageGroupImages((item as Record<string, unknown>).image_groups),
      firstImageGroupImages((item as Record<string, unknown>).image_groups),
      (product as Record<string, unknown>).cover_image_url,
      (product as Record<string, unknown>).image_url,
      (product as Record<string, unknown>).thumbnail_url,
      (product as Record<string, unknown>).images,
    );

    return (Array.isArray(item.variants) ? item.variants : [])
      .map((variantItem) => {
        const variantItemRecord = variantItem as Record<string, unknown>;
        const variant = (variantItem.variant || {}) as Record<string, unknown>;
        const externalId = variantExternalId(variant);
        if (!externalId) return null;
        const skuGroup = findSkuGroupForVariant(
          (item as Record<string, unknown>).image_groups,
          externalId,
          typeof variant.sku === "string" ? variant.sku : null,
        );

        const attributes = [
          ...normalizeAttributeItems(variantItem.attribute_values),
          ...normalizeAttributeItems(variantItem.attributes),
          ...normalizeAttributeItems(variantItemRecord.options),
          ...normalizeAttributeItems(variantItemRecord.option_values),
          ...normalizeAttributeItems(variantItemRecord.values),
          ...normalizeAttributeItems(variantItemRecord.properties),
          ...normalizeAttributeItems(variant.attributes),
          ...normalizeAttributeItems(variant.options),
          ...normalizeAttributeItems(variant.option_values),
          ...normalizeAttributeItems(variant.values),
          ...normalizeAttributeItems(variant.properties),
        ];
        const color = findVariantAttribute(attributes, "color");
        const size = findVariantAttribute(attributes, "size");
        const directRecords = [variantItemRecord, variant];
        const combinationParts = variantCombinationParts(
          {
            ...variantItemRecord,
            combination_key:
              variantItemRecord.combination_key || skuGroup?.combination_key,
          },
          variant,
        );
        const imageKey = String(
          variant.image_key ||
            variant.variant_image_key ||
            variantItemRecord.image_key ||
            skuGroup?.image_key ||
            "",
        );
        const directColorName = directVariantValue(directRecords, [
          "color_name",
          "colorName",
          "color",
          "cor",
          "colour",
          "variant_color",
          "variantColor",
          "option1",
          "option_1",
        ]);
        const directColorCode = directVariantCode(directRecords, [
          "color_code",
          "colorCode",
          "color_slug",
          "colorSlug",
          "cor_codigo",
          "corCode",
        ]);
        const directSizeName = directVariantValue(directRecords, [
          "size_name",
          "sizeName",
          "size",
          "tamanho",
          "tam",
          "variant_size",
          "variantSize",
          "option2",
          "option_2",
        ]);
        const directSizeCode = directVariantCode(directRecords, [
          "size_code",
          "sizeCode",
          "size_slug",
          "sizeSlug",
          "tamanho_codigo",
          "tamanhoCode",
        ]);
        const fallbackColorName =
          (color ? attributeValueName(color) : "") ||
          directColorName ||
          combinationParts[0] ||
          humanizeAttributeFallback(imageKey);
        const fallbackColorCode =
          (color ? attributeValueCode(color) : "") ||
          directColorCode ||
          slugify(fallbackColorName) ||
          null;
        const fallbackSizeName =
          (size ? attributeValueName(size) : "") ||
          directSizeName ||
          combinationParts[1] ||
          sizeFromSku(variant.sku);
        const fallbackSizeCode =
          (size ? attributeValueCode(size) : "") ||
          directSizeCode ||
          slugify(fallbackSizeName) ||
          null;
        const promoPrice = centsToPrice(variant.promo_cents);
        const basePrice = centsToPrice(variant.price_cents);

        return {
          asset_id:
            variant.asset_id === undefined || variant.asset_id === null
              ? null
              : String(variant.asset_id),
          color_code: fallbackColorCode,
          color_hex: (color ? attributeHex(color) : null) || directVariantHex(directRecords),
          color_name: fallbackColorName || null,
          compare_at_price:
            promoPrice && basePrice && promoPrice < basePrice
              ? basePrice
              : null,
          external_id: externalId,
          image_url:
            firstImageUrl(
              settings,
              variantItem.images,
              skuGroup?.images,
              imageGroupImages(
                (item as Record<string, unknown>).image_groups,
                imageKey,
              ),
              firstImageGroupImages(
                (item as Record<string, unknown>).image_groups,
              ),
              variant.image_url,
              variant.image,
              variant.thumbnail_url,
            ) ?? productImageUrl,
          metadata: {
            attributes,
            image_key: imageKey || null,
          },
          platform: "upzero",
          price: promoPrice ?? basePrice,
          product_external_id: productExternalId,
          size_code: fallbackSizeCode,
          size_name: fallbackSizeName || null,
          sku:
            typeof variant.sku === "string" && variant.sku.trim()
              ? variant.sku
              : null,
          status: variant.active === false ? "draft" : "active",
          stock_qty: numericInteger(variant.stock_qty),
          store_id: storeId,
        };
      })
      .filter(Boolean);
  });
}

function externalRows(
  items: ExternalProduct[],
  storeId: string,
  settings: Settings,
) {
  return items
    .map((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const activeVariants = variants.filter(
        (variant) => variant.active !== false,
      );
      const variantSet = activeVariants.length ? activeVariants : variants;
      const promoPrice = minPrice(
        variantSet.map((variant) => numericPrice(variant.promotional_price)),
      );
      const basePrice = minPrice(
        variantSet.map((variant) => numericPrice(variant.price)),
      );
      const price = promoPrice ?? basePrice;
      const externalId = product.product_id || product.id;
      const imageUrl = firstImageUrl(
        settings,
        product.images,
        (product as Record<string, unknown>).image,
        (product as Record<string, unknown>).image_url,
        (product as Record<string, unknown>).thumbnail_url,
        (product as Record<string, unknown>).cover_image_url,
        (product as Record<string, unknown>).media,
        (product as Record<string, unknown>).photos,
        variantSet.flatMap((variant) => variant.images || []),
      );
      if (!externalId || !product.name) return null;

      return {
        compare_at_price:
          promoPrice && basePrice && promoPrice < basePrice ? basePrice : null,
        currency: "BRL",
        description: product.description_html || null,
        external_id: String(externalId),
        image_url: imageUrl,
        name: product.name,
        platform: "upzero",
        price,
        product_url: buildProductUrl(
          settings.storefront_url,
          settings.product_url_pattern,
          {
            code: product.code,
            id: externalId,
            name: product.name,
            slug: product.code,
          },
        ),
        status:
          product.status === "archived"
            ? "archived"
            : product.status === "inactive"
              ? "draft"
              : "active",
        store_id: storeId,
      };
    })
    .filter(Boolean);
}

function externalVariantRows(
  items: ExternalProduct[],
  storeId: string,
  settings: Settings,
) {
  return items.flatMap((product) => {
    const productExternalId = product.product_id || product.id;
    if (!productExternalId) return [];
    const productImageUrl = firstImageUrl(
      settings,
      product.images,
      (product as Record<string, unknown>).image,
      (product as Record<string, unknown>).image_url,
      (product as Record<string, unknown>).thumbnail_url,
      (product as Record<string, unknown>).cover_image_url,
    );

    return (Array.isArray(product.variants) ? product.variants : [])
      .map((variant) => {
        const variantRecord = variant as Record<string, unknown>;
        const externalId = variantExternalId(variantRecord);
        if (!externalId) return null;
        const attributes = [
          ...normalizeAttributeItems(variant.attributes),
          ...normalizeAttributeItems(variantRecord.options),
          ...normalizeAttributeItems(variantRecord.option_values),
          ...normalizeAttributeItems(variantRecord.values),
          ...normalizeAttributeItems(variantRecord.properties),
        ];
        const color = findVariantAttribute(attributes, "color");
        const size = findVariantAttribute(attributes, "size");
        const directRecords = [variantRecord];
        const combinationParts = variantCombinationParts(
          variantRecord,
          variantRecord,
        );
        const imageKey = String(
          variantRecord.image_key || variantRecord.variant_image_key || "",
        );
        const directColorName = directVariantValue(directRecords, [
          "color_name",
          "colorName",
          "color",
          "cor",
          "colour",
          "variant_color",
          "variantColor",
          "option1",
          "option_1",
        ]);
        const directColorCode = directVariantCode(directRecords, [
          "color_code",
          "colorCode",
          "color_slug",
          "colorSlug",
          "cor_codigo",
          "corCode",
        ]);
        const directSizeName = directVariantValue(directRecords, [
          "size_name",
          "sizeName",
          "size",
          "tamanho",
          "tam",
          "variant_size",
          "variantSize",
          "option2",
          "option_2",
        ]);
        const directSizeCode = directVariantCode(directRecords, [
          "size_code",
          "sizeCode",
          "size_slug",
          "sizeSlug",
          "tamanho_codigo",
          "tamanhoCode",
        ]);
        const fallbackColorName =
          (color ? attributeValueName(color) : "") ||
          directColorName ||
          combinationParts[0] ||
          humanizeAttributeFallback(imageKey);
        const fallbackColorCode =
          (color ? attributeValueCode(color) : "") ||
          directColorCode ||
          slugify(fallbackColorName) ||
          null;
        const fallbackSizeName =
          (size ? attributeValueName(size) : "") ||
          directSizeName ||
          combinationParts[1] ||
          sizeFromSku(variant.sku);
        const fallbackSizeCode =
          (size ? attributeValueCode(size) : "") ||
          directSizeCode ||
          slugify(fallbackSizeName) ||
          null;
        const promoPrice = numericPrice(variant.promotional_price);
        const basePrice = numericPrice(variant.price);

        return {
          asset_id:
            variantRecord.asset_id === undefined ||
            variantRecord.asset_id === null
              ? null
              : String(variantRecord.asset_id),
          color_code: fallbackColorCode,
          color_hex: (color ? attributeHex(color) : null) || directVariantHex(directRecords),
          color_name: fallbackColorName || null,
          compare_at_price:
            promoPrice && basePrice && promoPrice < basePrice
              ? basePrice
              : null,
          external_id: externalId,
          image_url:
            firstImageUrl(settings, variant.images, variantRecord.image_url) ??
            productImageUrl,
          metadata: { attributes },
          platform: "upzero",
          price: promoPrice ?? basePrice,
          product_external_id: String(productExternalId),
          size_code: fallbackSizeCode,
          size_name: fallbackSizeName || null,
          sku: variant.sku || null,
          status:
            product.status === "archived"
              ? "archived"
              : variant.active === false
                ? "draft"
                : "active",
          stock_qty: numericInteger(variant.stock_qty),
          store_id: storeId,
        };
      })
      .filter(Boolean);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const storeId = String(body.store_id || "").trim();
  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "invalid_user" }, 401);
  }

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return jsonResponse({ error: "store_access_denied" }, 403);
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, settings")
    .eq("store_id", storeId)
    .eq("provider", "upzero")
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.id) {
    return jsonResponse({ error: "upzero_not_connected" }, 400);
  }

  const { data: secret } = await supabase
    .from("integration_secrets")
    .select("access_token")
    .eq("integration_id", integration.id)
    .maybeSingle();

  if (!secret?.access_token) {
    return jsonResponse({ error: "missing_upzero_api_key" }, 400);
  }

  const settings = (
    integration.settings &&
    typeof integration.settings === "object" &&
    !Array.isArray(integration.settings)
      ? integration.settings
      : {}
  ) as Settings;
  if (!settings.storefront_url) {
    const { data: store } = await supabase
      .from("stores")
      .select("url")
      .eq("id", storeId)
      .maybeSingle();
    settings.storefront_url =
      String(store?.url || "")
        .trim()
        .replace(/\/+$/, "") || null;
  }
  const baseUrl = normalizeBaseUrl(settings.base_url);
  const preferredSource = String(
    settings.last_connection_source || "storefront",
  );
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": secret.access_token,
  };
  const limit = 100;
  let pages = 0;
  let source = "storefront";
  const storefrontFailures: SyncAttempt[] = [];
  const syncedProducts: Array<Record<string, unknown>> = [];
  const syncedVariants: Array<Record<string, unknown>> = [];
  let detailEnrichedCount = 0;

  if (settings.storefront_url) {
    try {
      const publicRows = await publicStorefrontSyncRows(storeId, settings);
      if (
        publicRows.productRows.length &&
        hasUsableUpzeroVariantRows(
          publicRows.variantRows as Array<Record<string, unknown>>,
        )
      ) {
        syncedProducts.push(
          ...(publicRows.productRows as Array<Record<string, unknown>>),
        );
        syncedVariants.push(
          ...(publicRows.variantRows as Array<Record<string, unknown>>),
        );
        detailEnrichedCount = publicRows.detailEnrichedCount;
        pages = publicRows.pages;
        source = "storefront_public_product_action";
      }
    } catch (_) {
      syncedProducts.length = 0;
      syncedVariants.length = 0;
      detailEnrichedCount = 0;
      pages = 0;
      source = "storefront";
    }
  }

  if (!syncedProducts.length && preferredSource === "external") {
    source = "external";
  }

  if (!syncedProducts.length && source !== "external") {
    for (let page = 1; page <= 20; page += 1) {
      const url = new URL(`${baseUrl}/v1/products`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("include_variants", "true");
      url.searchParams.set("max_images_per_product", "3");

      let response = await fetchWithTimeout(url, { headers });
      let usedCardMode = false;
      if (!response.ok) {
        storefrontFailures.push({
          details: await readJson(response),
          source: "storefront_include_variants",
          status: response.status,
        });
        const fallbackUrl = new URL(`${baseUrl}/v1/products`);
        fallbackUrl.searchParams.set("page", String(page));
        fallbackUrl.searchParams.set("limit", String(limit));
        fallbackUrl.searchParams.set("card_mode", "true");
        fallbackUrl.searchParams.set("include_variants", "false");
        fallbackUrl.searchParams.set("max_images_per_product", "3");
        response = await fetchWithTimeout(fallbackUrl, { headers });
        usedCardMode = response.ok;
      }

      if (!response.ok) {
        storefrontFailures.push({
          details: await readJson(response),
          source: "storefront_card_mode",
          status: response.status,
        });
        if (page === 1 && preferredSource === "external") {
          source = "external";
          break;
        }
        if (page === 1) {
        const publicFallback = await publicStorefrontSyncRows(
          storeId,
          settings,
        );
          if (publicFallback.productRows.length) {
            syncedProducts.push(
              ...(publicFallback.productRows as Array<Record<string, unknown>>),
            );
            syncedVariants.push(
              ...(publicFallback.variantRows as Array<Record<string, unknown>>),
            );
            pages = publicFallback.pages;
            source = "storefront_public_html";
            break;
          }
          return jsonResponse(
            {
              attempts: storefrontFailures,
              error: "upzero_storefront_product_sync_failed",
              source: "storefront",
              status: response.status,
            },
            response.status === 401 ? 401 : 502,
          );
        }
        break;
      }

      const payload = await readJson(response);
      const items = (
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload.items)
            ? payload.items
            : []
      ) as StorefrontProductItem[];
      if (usedCardMode) source = "storefront_card_mode";
      const enrichedItems = await enrichStorefrontItemsWithDetails(
        baseUrl,
        headers,
        settings,
        items,
      );
      detailEnrichedCount += enrichedItems.filter((item) => {
        const variants = Array.isArray(item.variants) ? item.variants : [];
        const hasAttributes = variants.some((variant) =>
          Array.isArray(variant?.attribute_values)
            ? variant.attribute_values.length > 0
            : false,
        );
        const hasImageGroups = Array.isArray(
          (item as Record<string, unknown>).image_groups,
        );
        return hasAttributes || hasImageGroups;
      }).length;
      const rows = storefrontRows(enrichedItems, storeId, settings);
      const variantRows = storefrontVariantRows(
        enrichedItems,
        storeId,
        settings,
      );
      syncedProducts.push(...(rows as Array<Record<string, unknown>>));
      syncedVariants.push(...(variantRows as Array<Record<string, unknown>>));
      pages = page;
      if (items.length < limit) break;
    }
  }

  if (source === "external") {
    syncedProducts.length = 0;
    syncedVariants.length = 0;
    detailEnrichedCount = 0;
    pages = 0;
    let cursor: string | null = null;
    for (let page = 1; page <= 20; page += 1) {
      const url = new URL(`${baseUrl}/external/v1/products`);
      url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);
      if (settings.integration_name)
        url.searchParams.set("integration", settings.integration_name);

      const response = await fetchWithTimeout(url, { headers });
      if (!response.ok) {
        const details = await readJson(response);
        const publicFallback = await publicStorefrontSyncRows(
          storeId,
          settings,
        );
        if (publicFallback.productRows.length) {
          syncedProducts.push(
            ...(publicFallback.productRows as Array<Record<string, unknown>>),
          );
          syncedVariants.push(
            ...(publicFallback.variantRows as Array<Record<string, unknown>>),
          );
          pages = publicFallback.pages;
          source = "storefront_public_html";
          break;
        }
        return jsonResponse(
          {
            attempts: [
              ...storefrontFailures,
              {
                details,
                source: "external_products",
                status: response.status,
              },
            ],
            details,
            error: "upzero_external_product_sync_failed",
            status: response.status,
          },
          response.status === 401 ? 401 : 502,
        );
      }

      const payload = await readJson(response);
      const items = (
        Array.isArray(payload.data) ? payload.data : []
      ) as ExternalProduct[];
      const rows = externalRows(items, storeId, settings);
      const variantRows = externalVariantRows(items, storeId, settings);
      syncedProducts.push(...(rows as Array<Record<string, unknown>>));
      syncedVariants.push(...(variantRows as Array<Record<string, unknown>>));
      pages = page;
      cursor =
        typeof payload.next_cursor === "string" ? payload.next_cursor : null;
      if (!cursor) break;
    }
  }

  const saveResult = await saveProducts(supabase, storeId, syncedProducts);
  if ("error" in saveResult && saveResult.error) {
    return jsonResponse(
      { details: saveResult.error.message, error: "luup_products_save_failed" },
      500,
    );
  }

  const variantsSaveResult = await saveVariants(
    supabase,
    storeId,
    syncedVariants,
  );
  if ("error" in variantsSaveResult && variantsSaveResult.error) {
    return jsonResponse(
      {
        details: variantsSaveResult.error.message,
        error: "luup_product_variants_save_failed",
      },
      500,
    );
  }

  await supabase
    .from("integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      settings: {
        ...settings,
        last_product_sync_count: saveResult.total,
        last_product_sync_images_found: syncedProducts.filter((product) =>
          Boolean(product.image_url),
        ).length,
        last_product_sync_inserted: saveResult.inserted,
        last_product_sync_pages: pages,
        last_product_sync_source: source,
        last_product_sync_updated: saveResult.updated,
        last_product_sync_detail_enriched: detailEnrichedCount,
        last_product_sync_variants_with_attributes: syncedVariants.filter(
          (variant) =>
            Boolean(
              variant.color_name ||
              variant.size_name ||
              variant.color_code ||
              variant.size_code,
            ),
        ).length,
        last_product_sync_variants_with_images: syncedVariants.filter(
          (variant) => Boolean(variant.image_url),
        ).length,
        last_product_sync_variants: variantsSaveResult.total,
      },
    })
    .eq("id", integration.id);

  return jsonResponse({
    count: saveResult.total,
    images_found: syncedProducts.filter((product) => Boolean(product.image_url))
      .length,
    inserted: saveResult.inserted,
    ok: true,
    pages,
    source,
    updated: saveResult.updated,
    detail_enriched: detailEnrichedCount,
    variants_with_attributes: syncedVariants.filter((variant) =>
      Boolean(
        variant.color_name ||
        variant.size_name ||
        variant.color_code ||
        variant.size_code,
      ),
    ).length,
    variants_with_images: syncedVariants.filter((variant) =>
      Boolean(variant.image_url),
    ).length,
    variants: variantsSaveResult.total,
  });
});
