import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { runInBatches } from "@/lib/batch";
import { findStoreMembership } from "@/lib/store-membership";
import {
  normalizeUpzeroBaseUrl,
  readUpzeroJson,
  upzeroApiHeaders,
  upzeroFetch,
  UPZERO_DETAIL_FETCH_TIMEOUT_MS,
} from "@/lib/upzero";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { discoverUpzeroCartContext } from "@/lib/upzero-discovery";
import { Prisma } from "../../../generated/prisma/client";

// Ported from supabase/functions/upzero-sync-products: storefront
// /v1/products (include_variants, then card_mode) enriched per product via
// /v1/product-images + /v1/product/data/{slug}, falling back to the partner
// /external/v1/products cursor API. The original's extra public-storefront
// HTML-scraping source (Next.js server-action probing) was intentionally not
// ported — see routes report.

type Settings = {
  base_url?: string | null;
  integration_name?: string | null;
  last_connection_source?: string | null;
  product_url_pattern?: string | null;
  storefront_url?: string | null;
  storefront_store_id?: number | string | null;
  [key: string]: unknown;
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

type SyncAttempt = {
  details: Record<string, unknown>;
  source: string;
  status: number;
};

type ProductStatusValue = "active" | "draft" | "archived";

type ProductRow = {
  compare_at_price: number | null;
  currency: string;
  description: string | null;
  external_id: string;
  image_url: string | null;
  name: string;
  platform: string;
  price: number | null;
  product_url: string | null;
  status: ProductStatusValue;
  store_id: string;
};

type VariantRow = {
  asset_id: string | null;
  color_code: string | null;
  color_hex: string | null;
  color_name: string | null;
  compare_at_price: number | null;
  external_id: string;
  image_url: string | null;
  metadata: Record<string, unknown>;
  platform: string;
  price: number | null;
  product_external_id: string;
  size_code: string | null;
  size_name: string | null;
  sku: string | null;
  status: ProductStatusValue;
  stock_qty: number | null;
  store_id: string;
};

const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose Upzero products sync."),
});

export const UpzeroSyncProductsSchema = {
  schema: {
    summary: "Sync Upzero products",
    description:
      "Pulls the store's product catalog from the Upzero API (storefront `/v1/products` with " +
      "per-product detail enrichment, falling back to the partner `/external/v1/products` " +
      "cursor API) and upserts products and product variants keyed by " +
      "(store_id, platform, external_id). Variants of touched products are archived first so " +
      "removed combinations end up archived with zero stock. When pagination confirms the full " +
      "catalog was fetched, products this run did not see are pruned: any video still linked to " +
      "one is best-effort re-linked to a same-named product this run did see, then the stale " +
      "row (and its now-orphaned variants) is deleted. Updates the integration's last_sync_at " +
      "and sync stats.",
    tags: ["upzero"],
    operationId: "upzeroSyncProducts",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.looseObject({
        ok: z.boolean(),
        count: z.number(),
        inserted: z.number(),
        updated: z.number(),
        pages: z.number(),
        source: z.string(),
        variants: z.number(),
        images_found: z.number(),
        catalog_fully_fetched: z.boolean(),
        pruned: z.number(),
        relinked_videos: z.number(),
      }),
      ...edgeErrorSchemas,
      // Sync failures echo the upstream attempts alongside the code.
      401: z.union([
        z.object({ message: z.string() }),
        z.looseObject({ error: z.string() }),
      ]),
      500: z.union([
        z.object({ message: z.string() }),
        z.looseObject({ error: z.string() }),
      ]),
      502: z.looseObject({ error: z.string() }),
    },
  },
};

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
  // Only ever preserve a literal "ref" if the source text actually has one
  // (some Upzero product codes really are "REF123") — a bare numeric id
  // (Upzero's real, verified-live URL scheme for this store: e.g.
  // "27082-vt-linho-gerlane", no "ref" anywhere) must NOT get one invented,
  // or the resulting slug 404s / mismatches the storefront's own routing.
  const refMatch = raw.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9]*)/i);
  if (refMatch?.[1]) return `ref${slugify(refMatch[1])}`;
  const numericMatch = raw.match(/\b(\d{3,}[a-z0-9]*)\b/i);
  if (numericMatch?.[1]) return slugify(numericMatch[1]);
  return slugify(raw.replace(/^ref\s*[:#-]?\s*/i, "ref"));
}

type SluggableProduct = {
  code?: string | null;
  id?: string | number | null;
  name?: string | null;
  slug?: string | null;
};

function upzeroProductSlug(product: SluggableProduct) {
  const nameSlug = slugify(product.name);
  const referenceSlug = upzeroReferenceSlug(
    product.slug || product.code || product.id || product.name,
  );
  if (referenceSlug && nameSlug) return `${referenceSlug}-${nameSlug}`;
  return (
    referenceSlug || nameSlug || slugify(product.slug || product.code || product.id)
  );
}

function buildProductUrl(
  storefrontUrl: string | null | undefined,
  pattern: string | null | undefined,
  product: SluggableProduct,
  storefrontStoreId?: number | string | null,
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
  // Legacy "/produto/{slug}" patterns saved by early connects are remapped to
  // the canonical storefront route.
  const normalizedPattern = /^\/?produto\/\{(?:slug|code|id)\}\/?$/i.test(rawPattern)
    ? "/produtos/{code}-{name_slug}"
    : rawPattern;
  const path = normalizedPattern
    .replace(/\{slug\}/g, encodeURIComponent(productSlug || String(slug)))
    .replace(
      /\{name_slug\}/g,
      encodeURIComponent(nameSlug || productSlug || String(slug)),
    )
    .replace(/\{product_slug\}/g, encodeURIComponent(productSlug || String(slug)))
    .replace(
      /\{code\}/g,
      encodeURIComponent(referenceSlug || productSlug || String(product.code || slug)),
    )
    .replace(/\{id\}/g, encodeURIComponent(String(product.id || slug)));
  // Verified live: this storefront template (vitrine-plus.upzero.com.br,
  // shared across multiple Upzero stores) requires the tenant's numeric
  // storefront id as the first path segment — "/40/produtos/..." — or the
  // route 404s/mismatches. Only known once discovered (see
  // upzeroSyncProductsHandler); omitted here when not yet cached.
  const idPrefix = storefrontStoreId
    ? `/${String(storefrontStoreId).replace(/^\/+|\/+$/g, "")}`
    : "";
  return `${base}${idPrefix}${path.startsWith("/") ? "" : "/"}${path}`;
}

function productUrlHandle(
  storefrontUrl: string | null | undefined,
  pattern: string | null | undefined,
  product: SluggableProduct,
) {
  const productUrl = buildProductUrl(storefrontUrl, pattern, product);
  if (!productUrl) return "";
  try {
    const path = new URL(productUrl).pathname;
    const match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function imageValue(value: unknown): string | null {
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
  return values.map(imageValue).filter((value): value is string => Boolean(value));
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
  } catch {
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

function imageGroupImages(imageGroups: unknown, imageKey?: string | null) {
  if (!Array.isArray(imageGroups)) return [];
  const groups = imageGroups.filter((group) => {
    if (!imageKey) return true;
    if (!group || typeof group !== "object" || Array.isArray(group)) return false;
    const record = group as Record<string, unknown>;
    return (
      String(record.image_key || record.variant_image_key || "") === String(imageKey)
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
      .map(
        (item): Record<string, unknown> => ({
          ...item,
          image_key: item.image_key || parentImageKey,
          images:
            Array.isArray(item.images) && item.images.length
              ? item.images
              : parentImages,
        }),
      );
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
      const groupVariantId = String(group.product_variant_id || group.variant_id || "");
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
    .filter((item): item is NonNullable<typeof item> => item !== null);
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

  const response = await upzeroFetch(url, { headers });
  if (!response.ok) return [];
  return normalizeProductImageGroups(await readUpzeroJson(response));
}

function storefrontProductFromDataPayload(
  payload: Record<string, unknown>,
  fallback: StorefrontProductItem,
): StorefrontProductItem {
  const payloadRoot =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
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
  if (
    findVariantAttribute(attributes, "color") ||
    findVariantAttribute(attributes, "size")
  ) {
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
): Promise<StorefrontProductItem> {
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
    product.code && product.name ? `${product.code}-${slugify(product.name)}` : "",
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
    const response = await upzeroFetch(
      url,
      { headers },
      UPZERO_DETAIL_FETCH_TIMEOUT_MS,
    );
    if (!response.ok) continue;
    const payload = await readUpzeroJson(response);
    const enriched = storefrontProductFromDataPayload(payload, {
      ...item,
      image_groups: imageGroups.length ? imageGroups : item.image_groups,
    });
    if (
      Array.isArray(enriched.variants) &&
      enriched.variants.some((variant) => storefrontVariantHasUsefulDetails(variant))
    ) {
      return enriched;
    }
    if (Array.isArray(enriched.image_groups)) {
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

function productKey(row: { platform?: unknown; external_id?: unknown }) {
  const platform = String(row.platform || "upzero");
  const externalId = String(row.external_id || "");
  return externalId ? `${platform}:${externalId}` : "";
}

function dedupeProducts(rows: ProductRow[]) {
  const byKey = new Map<string, ProductRow>();
  for (const row of rows) {
    const key = productKey(row);
    if (!key) continue;
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function dedupeVariants(rows: VariantRow[]) {
  const byKey = new Map<string, VariantRow>();
  for (const row of rows) {
    const platform = String(row.platform || "upzero");
    const externalId = String(row.external_id || "");
    if (!externalId) continue;
    byKey.set(`${platform}:${externalId}`, row);
  }
  return Array.from(byKey.values());
}

function normalizeAttributeItems(value: unknown): Array<Record<string, unknown>> {
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

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Upzero's actual variant attribute shape (verified against live synced
// data): each entry is `{ attribute: { id, code, name }, term: { code, name } }`
// — the attribute DEFINITION (is this "color" or "size"?) nested under
// `attribute`, the actual VALUE ("BLUSH", "42") nested under `term`. Every
// synced variant for at least one real store had 100% NULL color/size
// columns because these helpers only ever looked for flat
// `attribute_code`/`term_name`-style keys or a bare string `item.attribute`,
// never this nested-object shape — `item.attribute` being an object made
// `attributeCode` stringify it to "[object object]" instead of falling
// through to a real value.
function attributeCode(item: Record<string, unknown>) {
  const nestedAttribute = asPlainRecord(item.attribute);
  if (nestedAttribute) {
    const nestedCode = nestedAttribute.code ?? nestedAttribute.id ?? nestedAttribute.name;
    if (nestedCode !== undefined && nestedCode !== null && nestedCode !== "") {
      return String(nestedCode).toLowerCase();
    }
  }
  return String(
    item.attribute_code ??
      item.attributeCode ??
      item.code ??
      (typeof item.attribute === "string" ? item.attribute : undefined) ??
      item.name ??
      "",
  ).toLowerCase();
}

function attributeName(item: Record<string, unknown>) {
  const nestedAttribute = asPlainRecord(item.attribute);
  if (nestedAttribute) {
    const nestedName = nestedAttribute.name ?? nestedAttribute.code;
    if (nestedName !== undefined && nestedName !== null && nestedName !== "") {
      return String(nestedName).toLowerCase();
    }
  }
  return String(
    item.attribute_name ?? item.attributeName ?? item.name ?? item.label ?? item.attribute_code ?? "",
  ).toLowerCase();
}

function attributeValueName(item: Record<string, unknown>) {
  const nestedTerm = asPlainRecord(item.term);
  if (nestedTerm) {
    const nestedName = nestedTerm.name ?? nestedTerm.code;
    if (nestedName !== undefined && nestedName !== null && nestedName !== "") {
      return String(nestedName).trim();
    }
  }
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
  const nestedTerm = asPlainRecord(item.term);
  if (nestedTerm) {
    const nestedCode = nestedTerm.code ?? nestedTerm.name;
    if (nestedCode !== undefined && nestedCode !== null && nestedCode !== "") {
      return String(nestedCode).trim();
    }
  }
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
  const nestedTerm = asPlainRecord(item.term);
  if (nestedTerm && typeof nestedTerm.hex === "string" && (nestedTerm.hex as string).trim()) {
    return nestedTerm.hex as string;
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
  const candidate = [...tokens].reverse().find((token) => knownSizes.has(token));
  if (!candidate) return "";
  return candidate === "UNICO" ? "Unico" : candidate;
}

function variantExternalId(variant: Record<string, unknown>) {
  const candidate =
    variant.product_variant_id ?? variant.variant_id ?? variant.external_id ?? variant.id;
  return candidate === undefined || candidate === null ? "" : String(candidate);
}

async function saveVariants(storeId: string, rows: VariantRow[]) {
  const uniqueRows = dedupeVariants(rows);
  if (!uniqueRows.length) return { total: 0 };

  try {
    const products = await prisma.product.findMany({
      where: { store_id: storeId, platform: "upzero" },
      select: { id: true, external_id: true },
    });

    const productsByExternalId = new Map<string, string>();
    for (const product of products) {
      if (product.external_id && product.id) {
        productsByExternalId.set(String(product.external_id), product.id);
      }
    }

    const rowsToUpsert = uniqueRows
      .map((row) => {
        const productId = productsByExternalId.get(String(row.product_external_id || ""));
        if (!productId) return null;
        const { product_external_id: _productExternalId, ...variantRow } = row;
        return { ...variantRow, product_id: productId, store_id: storeId };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (!rowsToUpsert.length) return { total: 0 };

    const touchedProductIds = [
      ...new Set(rowsToUpsert.map((row) => row.product_id).filter(Boolean)),
    ];

    // Variants missing from this sync payload stay archived with zero stock.
    if (touchedProductIds.length) {
      await prisma.productVariant.updateMany({
        where: {
          store_id: storeId,
          platform: "upzero",
          product_id: { in: touchedProductIds },
        },
        data: { status: "archived", stock_qty: 0 },
      });
    }

    await runInBatches(
      rowsToUpsert.map((row) => {
        const data = { ...row, metadata: row.metadata as Prisma.InputJsonValue };
        return prisma.productVariant.upsert({
          where: {
            store_id_platform_external_id: {
              store_id: storeId,
              platform: row.platform,
              external_id: row.external_id,
            },
          },
          create: data,
          update: data,
        });
      }),
    );

    return { total: rowsToUpsert.length };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      total: uniqueRows.length,
    };
  }
}

async function saveProducts(storeId: string, rows: ProductRow[]) {
  const uniqueRows = dedupeProducts(rows);
  if (!uniqueRows.length) return { inserted: 0, total: 0, updated: 0 };

  try {
    const existingProducts = await prisma.product.findMany({
      where: { store_id: storeId, platform: "upzero" },
      select: { id: true, external_id: true, image_url: true, platform: true },
    });

    const existingByKey = new Map<string, { id: string; image_url: string | null }>();
    for (const product of existingProducts) {
      const key = productKey(product);
      if (key) {
        existingByKey.set(key, {
          id: product.id,
          image_url:
            typeof product.image_url === "string" && product.image_url.trim()
              ? product.image_url
              : null,
        });
      }
    }

    const rowsToInsert: ProductRow[] = [];
    const updates: ReturnType<typeof prisma.product.update>[] = [];

    for (const row of uniqueRows) {
      const existing = existingByKey.get(productKey(row));
      if (!existing) {
        rowsToInsert.push(row);
        continue;
      }

      updates.push(
        prisma.product.update({
          where: { id: existing.id },
          data: {
            compare_at_price: row.compare_at_price ?? null,
            currency: row.currency || "BRL",
            description: row.description ?? null,
            // A sync without images keeps the previously stored image.
            image_url: row.image_url ?? existing.image_url ?? null,
            name: row.name,
            price: row.price ?? null,
            product_url: row.product_url ?? null,
            status: row.status || "active",
          },
        }),
      );
    }

    await runInBatches(updates);
    const updated = updates.length;

    if (rowsToInsert.length) {
      await prisma.product.createMany({ data: rowsToInsert });
    }

    return { inserted: rowsToInsert.length, total: uniqueRows.length, updated };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      inserted: 0,
      total: uniqueRows.length,
      updated: 0,
    };
  }
}

// Upzero occasionally re-issues a product's id (observed live: a re-sync
// returned the same catalog item — same name, same variants — under a new
// numeric id). The old upsert-only flow left the previous row behind
// forever: still linked from any video that referenced it, but permanently
// stuck with whatever (possibly stale/incomplete) data it had at the time,
// since nothing ever touches an external_id the API stops returning.
// This prunes exactly that: products for this store that this sync run did
// NOT see, best-effort re-linking any video still pointing at one over to a
// same-named product this run DID see, before deleting the stale row
// (cascades to its own now-orphaned variants).
async function pruneStaleUpzeroProducts(storeId: string, freshExternalIds: Set<string>) {
  // Never prune off an empty/near-empty fresh set — that almost certainly
  // means an upstream hiccup produced a suspiciously small page, not that
  // the store's real catalog just became empty. Callers only invoke this
  // when the sync pagination reached a confirmed natural end, but this stays
  // as a second, independent guard against wiping a whole catalog.
  if (!freshExternalIds.size) return { relinked: 0, removed: 0 };

  const existingProducts = await prisma.product.findMany({
    where: { store_id: storeId, platform: "upzero" },
    select: { id: true, external_id: true, name: true },
  });

  const staleProducts = existingProducts.filter(
    (product) => !product.external_id || !freshExternalIds.has(product.external_id),
  );
  if (!staleProducts.length) return { relinked: 0, removed: 0 };

  const freshIdByName = new Map<string, string>();
  for (const product of existingProducts) {
    if (product.external_id && freshExternalIds.has(product.external_id)) {
      freshIdByName.set(product.name, product.id);
    }
  }

  let relinked = 0;
  for (const stale of staleProducts) {
    const freshId = freshIdByName.get(stale.name);
    if (!freshId) continue;

    const staleLinks = await prisma.videoProduct.findMany({
      where: { product_id: stale.id },
      select: { id: true, video_id: true },
    });
    if (!staleLinks.length) continue;

    // A video already linked to the fresh product can't take a second link
    // to it (unique on video_id+product_id) — leave those stale rows alone;
    // deleting the stale product cascades them away as redundant.
    const alreadyLinkedVideoIds = new Set(
      (
        await prisma.videoProduct.findMany({
          where: {
            product_id: freshId,
            video_id: { in: staleLinks.map((link) => link.video_id) },
          },
          select: { video_id: true },
        })
      ).map((link) => link.video_id),
    );

    const relinkableIds = staleLinks
      .filter((link) => !alreadyLinkedVideoIds.has(link.video_id))
      .map((link) => link.id);
    if (relinkableIds.length) {
      const result = await prisma.videoProduct.updateMany({
        where: { id: { in: relinkableIds } },
        data: { product_id: freshId },
      });
      relinked += result.count;
    }
  }

  const { count: removed } = await prisma.product.deleteMany({
    where: { id: { in: staleProducts.map((product) => product.id) } },
  });

  return { relinked, removed };
}

function storefrontRows(
  items: StorefrontProductItem[],
  storeId: string,
  settings: Settings,
): ProductRow[] {
  return items
    .map((item): ProductRow | null => {
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
          variantSet.map((variant) => centsToPrice(variant.variant?.price_cents)),
        );
      const price =
        centsToPrice(product.card_data?.promo_cents) ?? promoPrice ?? basePrice;
      const productRecord = product as Record<string, unknown>;
      const imageUrl = firstImageUrl(
        settings,
        product.card_data?.cover_image_url,
        product.card_data,
        imageGroupImages(item.image_groups),
        firstImageGroupImages(item.image_groups),
        productRecord.cover_image_url,
        productRecord.image_url,
        productRecord.thumbnail_url,
        productRecord.image,
        productRecord.images,
        productRecord.media,
        productRecord.photos,
        variantSet.flatMap((variant) => variant.images || []),
      );
      const externalId =
        product.id === undefined || product.id === null ? null : String(product.id);
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
          settings.storefront_store_id,
        ),
        status: "active" as const,
        store_id: storeId,
      };
    })
    .filter((row): row is ProductRow => row !== null);
}

function storefrontVariantRows(
  items: StorefrontProductItem[],
  storeId: string,
  settings: Settings,
): VariantRow[] {
  return items.flatMap((item) => {
    const product = item.product || {};
    const productExternalId =
      product.id === undefined || product.id === null ? "" : String(product.id);
    if (!productExternalId) return [];

    const productRecord = product as Record<string, unknown>;
    const productImageUrl = firstImageUrl(
      settings,
      product.card_data?.cover_image_url,
      product.card_data,
      imageGroupImages(item.image_groups),
      firstImageGroupImages(item.image_groups),
      productRecord.cover_image_url,
      productRecord.image_url,
      productRecord.thumbnail_url,
      productRecord.images,
    );

    return (Array.isArray(item.variants) ? item.variants : [])
      .map((variantItem): VariantRow | null => {
        const variantItemRecord = variantItem as Record<string, unknown>;
        const variant = (variantItem.variant || {}) as Record<string, unknown>;
        const externalId = variantExternalId(variant);
        if (!externalId) return null;
        const skuGroup = findSkuGroupForVariant(
          item.image_groups,
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
          color_hex:
            (color ? attributeHex(color) : null) || directVariantHex(directRecords),
          color_name: fallbackColorName || null,
          compare_at_price:
            promoPrice && basePrice && promoPrice < basePrice ? basePrice : null,
          external_id: externalId,
          image_url:
            firstImageUrl(
              settings,
              variantItem.images,
              skuGroup?.images,
              imageGroupImages(item.image_groups, imageKey),
              firstImageGroupImages(item.image_groups),
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
          status: (variant.active === false ? "draft" : "active") as ProductStatusValue,
          stock_qty: numericInteger(variant.stock_qty),
          store_id: storeId,
        };
      })
      .filter((row): row is VariantRow => row !== null);
  });
}

function externalRows(
  items: ExternalProduct[],
  storeId: string,
  settings: Settings,
): ProductRow[] {
  return items
    .map((product): ProductRow | null => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const activeVariants = variants.filter((variant) => variant.active !== false);
      const variantSet = activeVariants.length ? activeVariants : variants;
      const promoPrice = minPrice(
        variantSet.map((variant) => numericPrice(variant.promotional_price)),
      );
      const basePrice = minPrice(variantSet.map((variant) => numericPrice(variant.price)));
      const price = promoPrice ?? basePrice;
      const externalId = product.product_id || product.id;
      const productRecord = product as Record<string, unknown>;
      const imageUrl = firstImageUrl(
        settings,
        product.images,
        productRecord.image,
        productRecord.image_url,
        productRecord.thumbnail_url,
        productRecord.cover_image_url,
        productRecord.media,
        productRecord.photos,
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
          settings.storefront_store_id,
        ),
        status: (product.status === "archived"
          ? "archived"
          : product.status === "inactive"
            ? "draft"
            : "active") as ProductStatusValue,
        store_id: storeId,
      };
    })
    .filter((row): row is ProductRow => row !== null);
}

function externalVariantRows(
  items: ExternalProduct[],
  storeId: string,
  settings: Settings,
): VariantRow[] {
  return items.flatMap((product) => {
    const productExternalId = product.product_id || product.id;
    if (!productExternalId) return [];
    const productRecord = product as Record<string, unknown>;
    const productImageUrl = firstImageUrl(
      settings,
      product.images,
      productRecord.image,
      productRecord.image_url,
      productRecord.thumbnail_url,
      productRecord.cover_image_url,
    );

    return (Array.isArray(product.variants) ? product.variants : [])
      .map((variant): VariantRow | null => {
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
        const combinationParts = variantCombinationParts(variantRecord, variantRecord);
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
            variantRecord.asset_id === undefined || variantRecord.asset_id === null
              ? null
              : String(variantRecord.asset_id),
          color_code: fallbackColorCode,
          color_hex:
            (color ? attributeHex(color) : null) || directVariantHex(directRecords),
          color_name: fallbackColorName || null,
          compare_at_price:
            promoPrice && basePrice && promoPrice < basePrice ? basePrice : null,
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
          status: (product.status === "archived"
            ? "archived"
            : variant.active === false
              ? "draft"
              : "active") as ProductStatusValue,
          stock_qty: numericInteger(variant.stock_qty),
          store_id: storeId,
        };
      })
      .filter((row): row is VariantRow => row !== null);
  });
}

export async function upzeroSyncProductsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const integration = await prisma.integration.findFirst({
    where: { store_id: storeId, provider: "upzero", status: "active" },
    select: { id: true, settings: true },
  });

  if (!integration?.id) {
    return reply.status(400).send({ error: "upzero_not_connected" });
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { integration_id: integration.id },
    select: { access_token: true },
  });

  if (!secret?.access_token) {
    return reply.status(400).send({ error: "missing_upzero_api_key" });
  }

  const settings: Settings =
    integration.settings &&
    typeof integration.settings === "object" &&
    !Array.isArray(integration.settings)
      ? { ...(integration.settings as Settings) }
      : {};
  if (!settings.storefront_url) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { url: true },
    });
    settings.storefront_url =
      String(store?.url || "")
        .trim()
        .replace(/\/+$/, "") || null;
  }

  // Best-effort: some Upzero storefront templates (verified live —
  // vitrine-plus.upzero.com.br, shared across multiple tenant stores)
  // require the numeric storefront id as the URL's first path segment, or
  // product links 404/mismatch. Only attempted once a previously-synced
  // product's real page exists to discover it from (a brand new store's
  // very first sync has nothing yet — skip rather than guess off the bare,
  // ambiguous multi-tenant storefront root); failures are silently
  // ignored, a future sync retries.
  if (!settings.storefront_store_id) {
    try {
      const existingProductWithUrl = await prisma.product.findFirst({
        where: { store_id: storeId, platform: "upzero", NOT: { product_url: null } },
        select: { product_url: true },
      });
      if (existingProductWithUrl?.product_url) {
        const discovered = await discoverUpzeroCartContext(existingProductWithUrl.product_url);
        if (discovered.storefront_store_id) {
          settings.storefront_store_id = discovered.storefront_store_id;
        }
      }
    } catch {
      // Non-fatal — product URLs just won't get the storefront-id prefix
      // this run.
    }
  }

  const baseUrl = normalizeUpzeroBaseUrl(
    typeof settings.base_url === "string" ? settings.base_url : null,
  );
  const preferredSource = String(settings.last_connection_source || "storefront");
  const headers = upzeroApiHeaders(secret.access_token);
  const limit = 100;
  let pages = 0;
  let source = "storefront";
  const storefrontFailures: SyncAttempt[] = [];
  const syncedProducts: ProductRow[] = [];
  const syncedVariants: VariantRow[] = [];
  let detailEnrichedCount = 0;
  // Only true once a source's pagination loop reaches the natural end of the
  // catalog (a short last page / an exhausted cursor) rather than just
  // hitting the 20-page safety cap — pruning stale products is only safe
  // when we know syncedProducts actually represents the FULL catalog, not a
  // truncated slice of it.
  let storefrontComplete = false;
  let externalComplete = false;

  if (preferredSource === "external") {
    source = "external";
  }

  if (source !== "external") {
    for (let page = 1; page <= 20; page += 1) {
      const url = new URL(`${baseUrl}/v1/products`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("include_variants", "true");
      url.searchParams.set("max_images_per_product", "3");

      let response = await upzeroFetch(url, { headers });
      let usedCardMode = false;
      if (!response.ok) {
        storefrontFailures.push({
          details: await readUpzeroJson(response),
          source: "storefront_include_variants",
          status: response.status,
        });
        const fallbackUrl = new URL(`${baseUrl}/v1/products`);
        fallbackUrl.searchParams.set("page", String(page));
        fallbackUrl.searchParams.set("limit", String(limit));
        fallbackUrl.searchParams.set("card_mode", "true");
        fallbackUrl.searchParams.set("include_variants", "false");
        fallbackUrl.searchParams.set("max_images_per_product", "3");
        response = await upzeroFetch(fallbackUrl, { headers });
        usedCardMode = response.ok;
      }

      if (!response.ok) {
        storefrontFailures.push({
          details: await readUpzeroJson(response),
          source: "storefront_card_mode",
          status: response.status,
        });
        if (page === 1 && preferredSource === "external") {
          source = "external";
          break;
        }
        if (page === 1) {
          return reply.status(response.status === 401 ? 401 : 502).send({
            attempts: storefrontFailures,
            error: "upzero_storefront_product_sync_failed",
            source: "storefront",
            status: response.status,
          });
        }
        break;
      }

      const payload = await readUpzeroJson(response);
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
        return hasAttributes || Array.isArray(item.image_groups);
      }).length;
      syncedProducts.push(...storefrontRows(enrichedItems, storeId, settings));
      syncedVariants.push(...storefrontVariantRows(enrichedItems, storeId, settings));
      pages = page;
      if (items.length < limit) {
        storefrontComplete = true;
        break;
      }
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
        url.searchParams.set("integration", String(settings.integration_name));

      const response = await upzeroFetch(url, { headers });
      if (!response.ok) {
        const details = await readUpzeroJson(response);
        return reply.status(response.status === 401 ? 401 : 502).send({
          attempts: [
            ...storefrontFailures,
            { details, source: "external_products", status: response.status },
          ],
          details,
          error: "upzero_external_product_sync_failed",
          status: response.status,
        });
      }

      const payload = await readUpzeroJson(response);
      const items = (Array.isArray(payload.data) ? payload.data : []) as ExternalProduct[];
      syncedProducts.push(...externalRows(items, storeId, settings));
      syncedVariants.push(...externalVariantRows(items, storeId, settings));
      pages = page;
      cursor = typeof payload.next_cursor === "string" ? payload.next_cursor : null;
      if (!cursor) {
        externalComplete = true;
        break;
      }
    }
  }

  const saveResult = await saveProducts(storeId, syncedProducts);
  if ("error" in saveResult && saveResult.error) {
    return reply
      .status(500)
      .send({ details: saveResult.error, error: "luup_products_save_failed" });
  }

  const variantsSaveResult = await saveVariants(storeId, syncedVariants);
  if ("error" in variantsSaveResult && variantsSaveResult.error) {
    return reply.status(500).send({
      details: variantsSaveResult.error,
      error: "luup_product_variants_save_failed",
    });
  }

  // Only safe once pagination confirmed it actually reached the end of the
  // catalog for whichever source ended up being used — otherwise
  // syncedProducts is a truncated slice and pruning would delete real,
  // not-yet-fetched products.
  const catalogFullyFetched = source === "external" ? externalComplete : storefrontComplete;
  let pruneResult = { relinked: 0, removed: 0 };
  if (catalogFullyFetched) {
    const freshExternalIds = new Set(syncedProducts.map((product) => product.external_id));
    pruneResult = await pruneStaleUpzeroProducts(storeId, freshExternalIds);
  }

  const imagesFound = syncedProducts.filter((product) => Boolean(product.image_url)).length;
  const variantsWithAttributes = syncedVariants.filter((variant) =>
    Boolean(
      variant.color_name || variant.size_name || variant.color_code || variant.size_code,
    ),
  ).length;
  const variantsWithImages = syncedVariants.filter((variant) =>
    Boolean(variant.image_url),
  ).length;

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      last_sync_at: new Date(),
      settings: {
        ...settings,
        last_product_sync_count: saveResult.total,
        last_product_sync_images_found: imagesFound,
        last_product_sync_inserted: saveResult.inserted,
        last_product_sync_pages: pages,
        last_product_sync_source: source,
        last_product_sync_updated: saveResult.updated,
        last_product_sync_detail_enriched: detailEnrichedCount,
        last_product_sync_variants_with_attributes: variantsWithAttributes,
        last_product_sync_variants_with_images: variantsWithImages,
        last_product_sync_variants: variantsSaveResult.total,
        last_product_sync_catalog_fully_fetched: catalogFullyFetched,
        last_product_sync_pruned: pruneResult.removed,
        last_product_sync_relinked_videos: pruneResult.relinked,
      } as Prisma.InputJsonValue,
    },
  });

  return reply.status(200).send({
    count: saveResult.total,
    images_found: imagesFound,
    inserted: saveResult.inserted,
    ok: true,
    pages,
    source,
    updated: saveResult.updated,
    detail_enriched: detailEnrichedCount,
    variants_with_attributes: variantsWithAttributes,
    variants_with_images: variantsWithImages,
    variants: variantsSaveResult.total,
    catalog_fully_fetched: catalogFullyFetched,
    pruned: pruneResult.removed,
    relinked_videos: pruneResult.relinked,
  });
}
