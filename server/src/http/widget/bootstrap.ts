import { createHash } from "node:crypto";
import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import {
  buildPageContext,
  filterVideosForContext,
  resolveDisplay,
  resolveWidgetConfig,
  slimVideos,
  type SerializedVideo,
} from "./context";
import { asRecord } from "@/lib/text";
import { storeHasBillingAccess } from "@/lib/billing-access";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { serializeVideo, VARIANT_SELECT, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { Prisma, WidgetType } from "../../../generated/prisma/client";
import { clean, findStore, WidgetStore } from "./resolve-store";

// Ported from supabase/functions/lupp-widget-bootstrap (GET). Public route:
// the storefront embed script calls it with whatever store identifiers it
// could scrape from the page, so every field is optional and resolution is a
// fallback chain (see resolve-store.ts).
const QuerySchema = z.object({
  store_id: z.string().optional().describe("Lupp store id."),
  lupp_store_id: z.string().optional().describe("Alias of store_id."),
  external_store_id: z.string().optional().describe("Platform store id (integration lookup)."),
  store: z.string().optional().describe("Alias of external_store_id."),
  provider: z
    .string()
    .optional()
    .describe("Integration provider hint for external_store_id (default nuvemshop)."),
  store_slug: z.string().optional().describe("Lupp store slug."),
  lupp_store: z.string().optional().describe("Alias of store_slug."),
  store_domain: z.string().optional().describe("Storefront domain for domain matching."),
  lupp_store_domain: z.string().optional().describe("Alias of store_domain."),
  domain: z.string().optional().describe("Alias of store_domain."),
  hostname: z.string().optional().describe("Alias of store_domain."),
  mode: z.string().optional().describe("feed (default) | preview | meta."),
  widget: z.string().optional().describe("Requested widget type (default floating_video)."),
  url: z
    .string()
    .optional()
    .describe(
      "Storefront page URL (origin+path). When present the server filters and " +
        "orders the videos for that page and returns slim render-ready cards " +
        "plus resolved config (context mode).",
    ),
  product_url: z.string().optional().describe("Explicit product URL override (data-product-url)."),
  external_product_id: z
    .string()
    .optional()
    .describe("Platform product id scraped from the page, for product matching."),
});

// Typed response contract for the embed script. Every object stays .loose():
// the serializers spread full DB rows (mode=feed returns extra video columns,
// timestamps, etc.), and unknown keys must keep passing through — the typed
// fields below are the ones widget.js actually reads and the generated API
// client exposes.
export const WidgetStoreSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    button_color: z.string(),
    status: z.string(),
    platform: z.string().nullable(),
    url: z.string().nullable(),
    plan_id: z.string(),
  })
  .loose();

const WidgetProductVariantSchema = z
  .object({
    id: z.string(),
    external_id: z.string(),
    sku: z.string().nullable(),
    color_name: z.string().nullable(),
    color_code: z.string().nullable(),
    color_hex: z.string().nullable(),
    size_name: z.string().nullable(),
    size_code: z.string().nullable(),
    price: z.number().nullable(),
    compare_at_price: z.number().nullable(),
    stock_qty: z.number().nullable(),
    image_url: z.string().nullable(),
    asset_id: z.string().nullable(),
    status: z.string(),
    metadata: z.unknown(),
  })
  .loose();

const WidgetProductSchema = z
  .object({
    id: z.string(),
    external_id: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    compare_at_price: z.number().nullable(),
    currency: z.string(),
    image_url: z.string().nullable(),
    product_url: z.string().nullable(),
    platform: z.string().nullable(),
    status: z.string(),
    product_variants: z.array(WidgetProductVariantSchema),
  })
  .loose();

// serializeVideo maps Prisma relations back to the PostgREST nesting the
// embed script consumes: video_products[].products.product_variants[].
// Exported: the public feed route returns the same serialized shape.
export const WidgetVideoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    video_url: z.string().nullable(),
    playback_url: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    product_visibility_scope: z.string(),
    product_visibility_url: z.string().nullable(),
    is_feed_enabled: z.boolean(),
    is_product_page_enabled: z.boolean(),
    is_featured: z.boolean(),
    sort_order: z.number(),
    video_products: z.array(
      z
        .object({ is_primary: z.boolean(), products: WidgetProductSchema })
        .loose(),
    ),
  })
  .loose();

const WidgetConfigSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    status: z.string(),
    settings: z.unknown(),
  })
  .loose();

// Context mode (url param present): slim render-ready cards — the browser
// renders these fields verbatim, no filtering/formatting client-side.
const WidgetSlimVideoSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    media_url: z.string(),
    thumbnail_url: z.string(),
    product: z
      .object({
        id: z.string().nullable(),
        external_id: z.string().nullable(),
        name: z.string(),
        image_url: z.string(),
        price_label: z.string(),
        product_url: z.string(),
      })
      .loose(),
  })
  .loose();

const ResolvedConfigSchema = z
  .object({
    launcher: z.record(z.string(), z.unknown()),
    display: z.record(z.string(), z.unknown()),
    carousel: z.record(z.string(), z.unknown()),
  })
  .loose();

const BootstrapResponseSchema = z
  .object({
    active: z.boolean(),
    error: z.string().optional(),
    mode: z.string().optional(),
    resolved_by: z.string().nullable(),
    store: WidgetStoreSchema,
    upzero_config: z.record(z.string(), z.unknown()).nullable().optional(),
    display: z
      .object({
        show: z.boolean(),
        reason: z.string(),
        show_home_carousel: z.boolean(),
      })
      .optional(),
    config: ResolvedConfigSchema.optional(),
    videos: z.array(z.union([WidgetSlimVideoSchema, WidgetVideoSchema])),
    widget: WidgetConfigSchema.nullable(),
  })
  .loose();

export const WidgetBootstrapSchema = {
  schema: {
    summary: "Widget bootstrap",
    description:
      "Public bootstrap for the storefront widget. Resolves the store through a fallback " +
      "chain (store_id → external_store_id via integrations → slug → domain), gates on " +
      "billing access (active:false + trial_expired when the store lost access), and returns " +
      "the active widget plus the feed videos with nested products/variants. Returns 404 " +
      "{active:false, error:store_not_found, tried} when no identifier matched.",
    tags: ["widget"],
    operationId: "getWidgetBootstrap",
    querystring: QuerySchema,
    response: {
      ...edgeErrorSchemas,
      200: BootstrapResponseSchema,
      404: z.object({
        active: z.boolean(),
        error: z.string(),
        tried: z.array(z.string()),
      }),
    },
  },
};

function mappedWidgetType(type: string) {
  if (
    type === "floating_launcher" ||
    type === "home_carousel" ||
    type === "horizontal_feed" ||
    type === "home_video_carousel" ||
    type === "carousel" ||
    type === "video_carousel"
  ) {
    return "floating_video";
  }
  return type;
}

function isWidgetType(value: string): value is WidgetType {
  return value in WidgetType;
}

// The horizontal feed (carousel) is a paid-tier feature: growth/pro/scale only.
function allowsHorizontalFeed(planId: unknown) {
  const normalized = clean(planId).toLowerCase();
  return ["growth", "pro", "scale"].includes(normalized);
}

type WidgetRow = {
  id: string;
  type: string;
  status: string;
  settings: unknown;
};

function enforceWidgetPlanLimits(widget: WidgetRow | null, store: WidgetStore) {
  if (!widget || allowsHorizontalFeed(store.plan_id)) return widget;

  const settings = asRecord(widget.settings);
  const carousel = asRecord(settings.carousel);

  return {
    ...widget,
    settings: {
      ...settings,
      carousel: {
        ...carousel,
        disabled_reason: "plan_widget_limit",
        enabled: false,
      },
    },
  };
}

function videosWhere(storeId: string): Prisma.VideoWhereInput {
  return {
    store_id: storeId,
    status: "active",
    processing_status: "ready",
    OR: [{ is_feed_enabled: true }, { is_product_page_enabled: true }],
  };
}

const VIDEOS_ORDER: Prisma.VideoOrderByWithRelationInput[] = [
  { is_featured: "desc" },
  { sort_order: "asc" },
  { created_at: "desc" },
];

async function loadVideos(storeId: string, mode: string): Promise<unknown[]> {
  if (mode === "preview") {
    const rows = await prisma.video.findMany({
      where: videosWhere(storeId),
      orderBy: VIDEOS_ORDER,
      take: 24,
      select: {
        id: true,
        title: true,
        video_url: true,
        playback_url: true,
        thumbnail_url: true,
        product_visibility_scope: true,
        product_visibility_url: true,
        is_feed_enabled: true,
        is_product_page_enabled: true,
        is_featured: true,
        sort_order: true,
        created_at: true,
        video_products: {
          select: {
            is_primary: true,
            product: {
              select: {
                id: true,
                external_id: true,
                name: true,
                description: true,
                price: true,
                compare_at_price: true,
                currency: true,
                image_url: true,
                product_url: true,
                platform: true,
                status: true,
                variants: { select: VARIANT_SELECT },
              },
            },
          },
        },
      },
    });
    return rows.map((row) => serializeVideo(row as unknown as VideoRow));
  }

  const rows = await prisma.video.findMany({
    where: videosWhere(storeId),
    orderBy: VIDEOS_ORDER,
    include: VIDEO_PRODUCTS_INCLUDE,
  });
  return rows.map((row) => serializeVideo(row as unknown as VideoRow));
}

async function buildUpzeroConfig(store: WidgetStore) {
  const integration = await prisma.integration.findFirst({
    where: { store_id: store.id, provider: "upzero", status: "active" },
    select: { id: true, external_store_id: true, settings: true },
  });
  if (!integration) return null;

  const settings = asRecord(integration.settings);
  const storefrontUrl = settings.storefront_url || store.url || null;
  const storefrontStoreId =
    settings.storefront_store_id || settings.store_id || settings.upzero_store_id || null;
  // Populated by the upzero-proxy discover_cart_context action (server-side
  // scrape of the storefront's Next.js chunks, cached per store) — the widget
  // uses these ids directly instead of scraping in the visitor's browser.
  const cartActionIds = Array.isArray(settings.cart_action_ids)
    ? settings.cart_action_ids.filter((id): id is string => typeof id === "string")
    : [];

  return {
    cart_action_ids: cartActionIds,
    base_url: settings.base_url || null,
    external_store_id: integration.external_store_id || null,
    integration_name: settings.integration_name || null,
    last_connection_source: settings.last_connection_source || null,
    product_url_pattern: settings.product_url_pattern || null,
    storefront_store_id: storefrontStoreId,
    storefront_url: storefrontUrl,
  };
}

export async function widgetBootstrapHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});
  const mode = clean(query.mode) || "feed";
  const widgetType = mappedWidgetType(clean(query.widget) || "floating_video");
  const context = mode === "meta" ? null : buildPageContext(query);

  const resolution = await findStore(query);
  const store = resolution.store;
  if (!store) {
    return reply
      .status(404)
      .send({ active: false, error: "store_not_found", tried: resolution.tried });
  }

  const canShowWidget = await storeHasBillingAccess(store.id);
  if (!canShowWidget) {
    // The original replied 200 here — the embed script switches on `active`,
    // not on the status code.
    return reply.status(200).send({
      active: false,
      error: "trial_expired",
      resolved_by: resolution.resolvedBy,
      store,
      ...(context
        ? { display: { show: false, reason: "trial_expired", show_home_carousel: false } }
        : {}),
      videos: [],
      widget: null,
    });
  }

  if (mode !== "meta") {
    // TODO(bunny-refresh): the original called refreshProcessingBunnyVideos
    // here — for up to 24 of the store's provider="bunny" videos stuck in
    // processing_status="processing" it fetched the Bunny Stream status
    // (GET /library/:libraryId/videos/:videoId) and updated duration_seconds,
    // file_size, playback_url, thumbnail_url, video_url and processing_status
    // before the feed query below. Needs the BUNNY_STREAM_* env vars and an
    // external HTTP call, so it is intentionally not ported yet — plug the
    // refresh here.
  }

  // The widget config, the feed videos and the Upzero settings are
  // independent lookups — run them concurrently. Widget types outside the
  // enum can never exist, so skip that query (the original's text column
  // simply returned no row for them).
  const [widget, videos, upzeroConfig] = await Promise.all([
    isWidgetType(widgetType)
      ? prisma.widget.findFirst({
          where: { store_id: store.id, type: widgetType, status: "active" },
          select: { id: true, type: true, status: true, settings: true },
        })
      : null,
    // Context mode always works from the bounded preview set — the launcher
    // never needs more, and the slim cards only use preview fields.
    mode === "meta" ? [] : loadVideos(store.id, context ? "preview" : mode),
    clean(store.platform).toLowerCase() === "upzero" ? buildUpzeroConfig(store) : null,
  ]);
  const effectiveWidget = enforceWidgetPlanLimits(widget, store);

  if (context) {
    const config = resolveWidgetConfig(widget, store);
    const filtered = filterVideosForContext(videos as SerializedVideo[], config, context);
    const display = resolveDisplay(config, context, filtered.length);
    const body = {
      active: Boolean(effectiveWidget),
      ...(effectiveWidget ? {} : { error: "no_active_widget" }),
      mode: "context",
      resolved_by: resolution.resolvedBy,
      store,
      upzero_config: upzeroConfig,
      display,
      config,
      videos: display.show ? slimVideos(filtered) : [],
      widget: effectiveWidget,
    };

    // The context answer is deterministic per (store, page, widget, data
    // version), so let browsers/CDNs reuse it: 60s freshness plus ETag
    // revalidation. 304s skip the payload; max-age skips the request.
    const etag = `"${createHash("md5").update(JSON.stringify(body)).digest("hex")}"`;
    reply.header("cache-control", "public, max-age=60");
    reply.header("etag", etag);
    if (request.headers["if-none-match"] === etag) {
      return reply.status(304).send();
    }
    return reply.status(200).send(body);
  }

  return reply.status(200).send({
    active: Boolean(effectiveWidget),
    ...(effectiveWidget ? {} : { error: "no_active_widget" }),
    mode,
    resolved_by: resolution.resolvedBy,
    store,
    upzero_config: upzeroConfig,
    videos,
    widget: effectiveWidget,
  });
}
