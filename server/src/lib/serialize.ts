import { Prisma } from "../../generated/prisma/client";

/**
 * Serialization helpers shared by every route that returns DB rows to the
 * SPA/widget. Responses mirror the snake_case PostgREST row shapes the client
 * consumed from Supabase: Decimal → number, BigInt → number, and the Prisma
 * relation names mapped back to the PostgREST nesting
 * (video_products[].products.product_variants[]).
 */

export function decimalToNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

// Same variant field list the original Supabase nested select used.
export const VARIANT_SELECT = {
  id: true,
  external_id: true,
  sku: true,
  color_name: true,
  color_code: true,
  color_hex: true,
  size_name: true,
  size_code: true,
  price: true,
  compare_at_price: true,
  stock_qty: true,
  image_url: true,
  asset_id: true,
  status: true,
  metadata: true,
} satisfies Prisma.ProductVariantSelect;

// Full-row nesting used by the widget bootstrap, the admin videos list and
// the public feed: video_products(*, products(*, product_variants(*))).
export const VIDEO_PRODUCTS_INCLUDE = {
  video_products: {
    select: {
      is_primary: true,
      product: { include: { variants: { select: VARIANT_SELECT } } },
    },
  },
} satisfies Prisma.VideoInclude;

type VariantRow = Record<string, unknown> & { price: unknown; compare_at_price: unknown };
type NestedProductRow = Record<string, unknown> & {
  price: unknown;
  compare_at_price: unknown;
  variants: VariantRow[];
};
type VideoProductRow = { is_primary: boolean; product: NestedProductRow };
export type VideoRow = Record<string, unknown> & { video_products: VideoProductRow[] };

export function serializeVideo(video: VideoRow) {
  const { video_products, ...videoFields } = video;
  return {
    ...videoFields,
    ...("file_size" in videoFields
      ? {
          file_size:
            videoFields.file_size === null ? null : Number(videoFields.file_size as bigint),
        }
      : {}),
    video_products: video_products.map(({ is_primary, product }) => {
      const { variants, ...productFields } = product;
      return {
        is_primary,
        products: {
          ...productFields,
          price: decimalToNumber(productFields.price),
          compare_at_price: decimalToNumber(productFields.compare_at_price),
          product_variants: variants.map((variant) => ({
            ...variant,
            price: decimalToNumber(variant.price),
            compare_at_price: decimalToNumber(variant.compare_at_price),
          })),
        },
      };
    }),
  };
}

export function serializeProduct<T extends { price: unknown; compare_at_price: unknown }>(
  product: T,
) {
  return {
    ...product,
    price: decimalToNumber(product.price),
    compare_at_price: decimalToNumber(product.compare_at_price),
  };
}

export function serializeSubscription<
  T extends { discount_percent: unknown; discount_amount: unknown },
>(subscription: T) {
  return {
    ...subscription,
    discount_percent: decimalToNumber(subscription.discount_percent),
    discount_amount: decimalToNumber(subscription.discount_amount),
  };
}

export function serializeCoupon<T extends { percent_off: unknown; amount_off: unknown }>(
  coupon: T,
) {
  return {
    ...coupon,
    percent_off: decimalToNumber(coupon.percent_off),
    amount_off: decimalToNumber(coupon.amount_off),
  };
}
