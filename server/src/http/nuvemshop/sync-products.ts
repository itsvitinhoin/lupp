import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { nuvemshopApiBase, nuvemshopRequest } from "@/lib/nuvemshop";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { asRecord } from "@/lib/text";

// Ported from supabase/functions/nuvemshop-sync-products: paginates the
// Nuvemshop products API (max 10 pages), normalizes products + variants
// (localized fields, prices, color/size options, installment texts) and
// upserts them on (store_id, platform, external_id).
type LocalizedValue = string | Record<string, string | null | undefined> | null | undefined;

type NuvemshopVariant = {
  available?: boolean | null;
  compare_at_price?: string | number | null;
  compare_at_price_long?: string | null;
  compare_at_price_short?: string | null;
  contact?: boolean | null;
  has_promotional_price?: boolean | null;
  id?: number | string;
  image_id?: number | string | null;
  image?: { src?: string | null } | number | string | null;
  image_url?: string | null;
  installments_data?: string | unknown[] | Record<string, unknown> | null;
  is_visible?: boolean | null;
  option0?: string | null;
  option1?: string | null;
  option2?: string | null;
  popup_discount_visibility?: unknown[] | null;
  price?: string | number | null;
  price_long?: string | null;
  price_number?: number | null;
  price_number_raw?: number | null;
  price_short?: string | null;
  price_with_payment_discount_short?: string | null;
  price_without_taxes?: string | null;
  promotional_price_number?: number | null;
  promotional_price_short?: string | null;
  promotional_price?: string | number | null;
  show_payment_discount_disclaimer?: boolean | null;
  sku?: string | null;
  stock?: string | number | null;
  stock_management?: boolean | null;
  values?: LocalizedValue[];
};

type NuvemshopProduct = {
  attributes?: LocalizedValue[];
  description?: LocalizedValue;
  handle?: LocalizedValue;
  id: number | string;
  images?: Array<{ id?: number | string | null; src?: string | null }>;
  name?: LocalizedValue;
  published?: boolean;
  variants?: NuvemshopVariant[];
};

type NuvemshopStore = {
  domains?: string[] | null;
  original_domain?: string | null;
};

const BodySchema = z.object({
  store_id: z.string().optional().describe("Store whose Nuvemshop catalog syncs."),
});

export const NuvemshopSyncProductsSchema = {
  schema: {
    summary: "Sync Nuvemshop products",
    description:
      "Fetches the connected Nuvemshop store's catalog (paginated, up to 10 pages of " +
      "100), normalizes products and variants (localized names, promotional prices, " +
      "color/size options with hex mapping, installment texts) and upserts them on " +
      "(store_id, platform, external_id). Also refreshes the storefront domains and " +
      "last-sync counters on the integration settings.",
    tags: ["nuvemshop"],
    operationId: "nuvemshopSyncProducts",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        count: z.number(),
        ok: z.boolean(),
        pages: z.number(),
        storefront_domain: z.string(),
        variants_count: z.number(),
      }),
      ...edgeErrorSchemas,
      500: z.looseObject({ error: z.string().optional(), message: z.string().optional() }),
      502: z.looseObject({ error: z.string() }),
    },
  },
};

function pickLocalized(value: LocalizedValue) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.pt || value["pt-BR"] || value.es || value.en || Object.values(value).find(Boolean) || "";
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toNumber(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColorName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COLOR_HEX_BY_NAME: Record<string, string> = {
  amarelo: "#FFEE02",
  "azul claro": "#00BFFF",
  "azul marinho": "#123A8C",
  "azul petroleo": "#1F8BC7",
  "azul royal": "#003CFF",
  azul: "#0000DC",
  bege: "#F5F5DC",
  branco: "#FFFFFF",
  caramelo: "#C47A32",
  cinza: "#9CA3AF",
  fucsia: "#CE3B72",
  laranja: "#F97316",
  lavanda: "#C4B5FD",
  lilas: "#C084FC",
  marrom: "#7A4A2A",
  marsala: "#7B1E3A",
  nude: "#E8C7B8",
  off: "#F8F7F2",
  "off white": "#F8F7F2",
  preto: "#000000",
  rosa: "#F7A8C7",
  rose: "#D9A0A7",
  roxo: "#7E22CE",
  verde: "#3F7D20",
  "verde oliva": "#4B6F29",
  vermelho: "#FF0000",
};

function colorNameToHex(value: string | null | undefined) {
  const normalized = normalizeColorName(value);
  return normalized ? COLOR_HEX_BY_NAME[normalized] || null : null;
}

function parseInstallmentsData(value: string | unknown[] | Record<string, unknown> | null | undefined) {
  if (!value) return null;
  if (Array.isArray(value) || typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatMoney(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(numeric);
}

function readNumberField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function buildInstallmentText(variant: NuvemshopVariant) {
  const installmentsData = parseInstallmentsData(variant.installments_data);
  let best: { quantity: number; amount: string; interestFree: boolean } | null = null;
  const rows: Array<{ quantity: number; payload: Record<string, unknown> }> = [];

  if (Array.isArray(installmentsData)) {
    installmentsData.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      rows.push({ payload: row as Record<string, unknown>, quantity: index + 1 });
    });
  } else if (installmentsData && typeof installmentsData === "object") {
    Object.values(installmentsData).forEach((installmentsByMethod) => {
      if (!installmentsByMethod || typeof installmentsByMethod !== "object") return;
      Object.entries(installmentsByMethod as Record<string, unknown>).forEach(([quantity, payload]) => {
        if (!payload || typeof payload !== "object") return;
        const parsedQuantity = Number(quantity);
        if (!Number.isFinite(parsedQuantity)) return;
        rows.push({ payload: payload as Record<string, unknown>, quantity: parsedQuantity });
      });
    });
  }

  for (const row of rows) {
    const payload = row.payload;
    const quantity = readNumberField(payload, ["installments", "quantity", "count"]) ?? row.quantity;
    const installmentAmount =
      formatMoney(payload.installment_value) ||
      formatMoney(payload.value) ||
      formatMoney(payload.amount);
    if (!quantity || !installmentAmount) continue;
    const hasInterest = Boolean(payload.has_interest ?? payload.with_interest ?? payload.interest);
    if (!best || (!hasInterest && best.interestFree === false) || quantity > best.quantity) {
      best = { amount: installmentAmount, interestFree: !hasInterest, quantity };
    }
  }

  if (!best) return null;
  return `${best.quantity} x de ${best.amount}${best.interestFree ? " sem juros" : ""}`;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const payload = error as Record<string, unknown>;
  return {
    code: typeof payload.code === "string" ? payload.code : null,
    details: typeof payload.details === "string" ? payload.details : null,
    hint: typeof payload.hint === "string" ? payload.hint : null,
    message: typeof payload.message === "string" ? payload.message : String(error),
  };
}

function uniqueByExternalId<T extends { external_id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.external_id, item);
  }
  return Array.from(map.values());
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getProductPrices(product: NuvemshopProduct) {
  const variant = product.variants?.[0];
  const price = toNumber(variant?.promotional_price) ?? toNumber(variant?.price);
  const compareAtPrice =
    toNumber(variant?.compare_at_price) ??
    (toNumber(variant?.promotional_price) ? toNumber(variant?.price) : null);
  return { compareAtPrice, price };
}

function attributeIndex(product: NuvemshopProduct, patterns: RegExp[]) {
  const attributes = Array.isArray(product.attributes) ? product.attributes : [];
  return attributes.findIndex((attribute) => {
    const name = pickLocalized(attribute);
    return patterns.some((pattern) => pattern.test(name));
  });
}

function variantValue(variant: NuvemshopVariant, index: number) {
  if (index < 0 || !Array.isArray(variant.values)) return "";
  return pickLocalized(variant.values[index]);
}

function pickVariantOption(product: NuvemshopProduct, variant: NuvemshopVariant, kind: "color" | "size") {
  const values = Array.isArray(variant.values) ? variant.values.map(pickLocalized).filter(Boolean) : [];
  const colorIndex = attributeIndex(product, [/cor/i, /color/i, /colou?r/i]);
  const sizeIndex = attributeIndex(product, [/tam/i, /tamanho/i, /size/i]);

  if (kind === "color") {
    return variantValue(variant, colorIndex) || variant.option0 || (values.length > 1 ? values[0] : "");
  }

  return variantValue(variant, sizeIndex) || variant.option1 || (values.length > 1 ? values[1] : values[0] || "Unico");
}

function pickVariantImage(product: NuvemshopProduct, variant: NuvemshopVariant) {
  if (variant.image_url) return variant.image_url.replace(/^\/\//, "https://");
  if (variant.image && typeof variant.image === "object" && "src" in variant.image && variant.image.src) {
    return variant.image.src;
  }
  const imageId = variant.image_id === undefined || variant.image_id === null ? "" : String(variant.image_id);
  if (imageId && Array.isArray(product.images)) {
    const image = product.images.find((item) => String(item.id || "") === imageId);
    if (image?.src) return image.src;
  }
  return product.images?.[0]?.src || null;
}

function normalizeVariant(product: NuvemshopProduct, storeId: string, productId: string) {
  return (product.variants ?? [])
    .filter((variant) => variant.id !== undefined && variant.id !== null)
    .map((variant, index) => {
      const price = toNumber(variant.promotional_price) ?? toNumber(variant.price);
      const compareAtPrice =
        toNumber(variant.compare_at_price) ??
        (toNumber(variant.promotional_price) ? toNumber(variant.price) : null);
      const colorName = pickVariantOption(product, variant, "color");
      const sizeName = pickVariantOption(product, variant, "size");
      const stockQty = variant.stock_management === false ? null : toNumber(variant.stock);
      const installmentText = buildInstallmentText(variant);
      const pixDiscountText = variant.price_with_payment_discount_short
        ? `No Pix: ${variant.price_with_payment_discount_short}`
        : null;

      return {
        asset_id: null,
        color_code: colorName || null,
        color_hex: colorNameToHex(colorName),
        color_name: colorName || null,
        compare_at_price: compareAtPrice,
        external_id: String(variant.id),
        image_url: pickVariantImage(product, variant),
        metadata: {
          available: variant.available ?? null,
          color_index: colorName ? index : null,
          compare_at_price_long: variant.compare_at_price_long ?? null,
          compare_at_price_short: variant.compare_at_price_short ?? null,
          contact: variant.contact ?? null,
          has_promotional_price: variant.has_promotional_price ?? null,
          installment_text: installmentText,
          installments_data: variant.installments_data ?? null,
          is_visible: variant.is_visible ?? null,
          option0: variant.option0 ?? null,
          option1: variant.option1 ?? null,
          option2: variant.option2 ?? null,
          payment_terms: [installmentText, pixDiscountText].filter(Boolean),
          pix_discount_text: pixDiscountText,
          popup_discount_visibility: variant.popup_discount_visibility ?? null,
          price_long: variant.price_long ?? null,
          price_number: variant.price_number ?? null,
          price_number_raw: variant.price_number_raw ?? null,
          price_short: variant.price_short ?? null,
          price_with_payment_discount_short: variant.price_with_payment_discount_short ?? null,
          price_without_taxes: variant.price_without_taxes ?? null,
          promotional_price_short: variant.promotional_price_short ?? null,
          raw_values: Array.isArray(variant.values) ? variant.values.map(pickLocalized) : [],
          show_payment_discount_disclaimer: variant.show_payment_discount_disclaimer ?? null,
          size_index: index,
          stock_management: variant.stock_management ?? null,
        } as Prisma.InputJsonValue,
        platform: "nuvemshop",
        price,
        product_id: productId,
        size_code: sizeName || "Unico",
        size_name: sizeName || "Unico",
        sku: variant.sku || null,
        status: (product.published === false ? "draft" : "active") as "draft" | "active",
        stock_qty: stockQty === null ? null : Math.trunc(stockQty),
        store_id: storeId,
      };
    });
}

function normalizeStoreDomain(value: string | null | undefined) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/+$/, "");
}

function pickStorefrontDomain(store: NuvemshopStore | null, externalStoreId: string) {
  const domains = Array.isArray(store?.domains) ? store?.domains ?? [] : [];
  const primaryDomain = domains.map(normalizeStoreDomain).find(Boolean);
  return primaryDomain || normalizeStoreDomain(store?.original_domain) || `${externalStoreId}.lojavirtualnuvem.com.br`;
}

function buildProductUrl(storefrontDomain: string, product: NuvemshopProduct) {
  const handle = pickLocalized(product.handle);
  if (!handle) return null;
  return `https://${storefrontDomain}/produtos/${handle}/`;
}

export async function nuvemshopSyncProductsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const appUserAgent = process.env.NUVEMSHOP_USER_AGENT || "Luup (suporte@luup.app)";

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const integration = await prisma.integration.findFirst({
    where: { store_id: storeId, provider: "nuvemshop", status: "active" },
    select: { id: true, external_store_id: true, settings: true },
  });
  if (!integration?.id || !integration.external_store_id) {
    return reply.status(400).send({ error: "nuvemshop_not_connected" });
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { integration_id: integration.id },
    select: { access_token: true },
  });
  if (!secret?.access_token) {
    return reply.status(400).send({ error: "missing_nuvemshop_access_token" });
  }

  const externalStoreId = String(integration.external_store_id);
  const apiBase = nuvemshopApiBase(externalStoreId);
  const apiHeaders = {
    Authorization: `Bearer ${secret.access_token}`,
    "Content-Type": "application/json",
    "User-Agent": appUserAgent,
  };

  const storeResult = await nuvemshopRequest(`${apiBase}/store`, { headers: apiHeaders });
  const nuvemshopStore = storeResult.ok ? (storeResult.data as NuvemshopStore | null) : null;
  const storefrontDomain = pickStorefrontDomain(nuvemshopStore, externalStoreId);
  const allProducts: NuvemshopProduct[] = [];
  const syncedProducts: Array<{
    compare_at_price: number | null;
    currency: string;
    description: string;
    external_id: string;
    image_url: string | null;
    name: string;
    platform: string;
    price: number | null;
    product_url: string | null;
    status: "draft" | "active";
    store_id: string;
  }> = [];
  let syncedVariantsCount = 0;
  let nextUrl: string | null = `${apiBase}/products?page=1&per_page=100`;
  let pages = 0;

  while (nextUrl && pages < 10) {
    pages += 1;
    const pageResult = await nuvemshopRequest(nextUrl, { headers: apiHeaders });

    if (!pageResult.ok) {
      return reply.status(502).send({
        details: pageResult.text.slice(0, 500),
        error: "nuvemshop_products_fetch_failed",
        status: pageResult.status,
      });
    }

    const products = pageResult.data as NuvemshopProduct[];
    allProducts.push(...products);
    syncedProducts.push(
      ...products.map((product) => {
        const { compareAtPrice, price } = getProductPrices(product);
        return {
          compare_at_price: compareAtPrice,
          currency: "BRL",
          description: stripHtml(pickLocalized(product.description)),
          external_id: String(product.id),
          image_url: product.images?.[0]?.src || null,
          name: pickLocalized(product.name) || `Produto ${product.id}`,
          platform: "nuvemshop",
          price,
          product_url: buildProductUrl(storefrontDomain, product),
          status: (product.published === false ? "draft" : "active") as "draft" | "active",
          store_id: storeId,
        };
      }),
    );

    const nextMatch = pageResult.linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch?.[1] || null;
  }

  if (syncedProducts.length) {
    const externalIds = syncedProducts.map((product) => product.external_id);
    const productsToSave = uniqueByExternalId(syncedProducts);

    for (const productChunk of chunk(productsToSave, 50)) {
      try {
        await prisma.$transaction(
          productChunk.map((product) =>
            prisma.product.upsert({
              where: {
                store_id_platform_external_id: {
                  store_id: storeId,
                  platform: "nuvemshop",
                  external_id: product.external_id,
                },
              },
              create: product,
              update: product,
            }),
          ),
        );
      } catch (upsertError) {
        return reply.status(500).send({
          details: errorDetails(upsertError),
          error: "luup_products_upsert_failed",
          products_attempted: productChunk.length,
        });
      }
    }

    const savedProducts = await prisma.product.findMany({
      where: { store_id: storeId, platform: "nuvemshop", external_id: { in: externalIds } },
      select: { id: true, external_id: true },
    });

    const savedProductIds = new Map(
      savedProducts.map((product) => [product.external_id, product.id]),
    );
    const variantsToSave = uniqueByExternalId(
      allProducts.flatMap((product) => {
        const productId = savedProductIds.get(String(product.id));
        return productId ? normalizeVariant(product, storeId, productId) : [];
      }),
    );
    syncedVariantsCount = variantsToSave.length;

    if (variantsToSave.length) {
      for (const variantChunk of chunk(variantsToSave, 100)) {
        try {
          await prisma.$transaction(
            variantChunk.map((variant) =>
              prisma.productVariant.upsert({
                where: {
                  store_id_platform_external_id: {
                    store_id: storeId,
                    platform: "nuvemshop",
                    external_id: variant.external_id,
                  },
                },
                create: variant,
                update: variant,
              }),
            ),
          );
        } catch (variantsError) {
          return reply.status(500).send({
            details: errorDetails(variantsError),
            error: "luup_product_variants_upsert_failed",
            variants_attempted: variantChunk.length,
          });
        }
      }
    }
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      last_sync_at: new Date(),
      settings: {
        ...asRecord(integration.settings),
        last_product_sync_count: syncedProducts.length,
        last_product_sync_pages: pages,
        nuvemshop_domains: Array.isArray(nuvemshopStore?.domains) ? nuvemshopStore?.domains : [],
        nuvemshop_original_domain: nuvemshopStore?.original_domain || null,
        storefront_domain: storefrontDomain,
      },
    },
  });

  return reply.status(200).send({
    count: syncedProducts.length,
    ok: true,
    pages,
    storefront_domain: storefrontDomain,
    variants_count: syncedVariantsCount,
  });
}
