import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
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
});

const BootstrapResponseSchema = z
  .object({
    active: z.boolean(),
    error: z.string().optional(),
    mode: z.string().optional(),
    resolved_by: z.string().nullable(),
    store: z.any(),
    upzero_config: z.any().nullable().optional(),
    videos: z.array(z.any()),
    widget: z.any().nullable(),
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

  const settings =
    widget.settings && typeof widget.settings === "object" && !Array.isArray(widget.settings)
      ? (widget.settings as Record<string, unknown>)
      : {};
  const carousel =
    settings.carousel && typeof settings.carousel === "object" && !Array.isArray(settings.carousel)
      ? (settings.carousel as Record<string, unknown>)
      : {};

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

  const settings =
    integration.settings &&
    typeof integration.settings === "object" &&
    !Array.isArray(integration.settings)
      ? (integration.settings as Record<string, unknown>)
      : {};
  const storefrontUrl = settings.storefront_url || store.url || null;
  const storefrontStoreId =
    settings.storefront_store_id || settings.store_id || settings.upzero_store_id || null;

  // TODO(upzero-discovery): when storefrontStoreId is still null the original
  // edge function fetched storefrontUrl's public HTML and scraped the numeric
  // storefront store id out of __NEXT_DATA__ / the /_next/static/chunks/ JS
  // bundles, then persisted it back to integrations.settings as
  // { storefront_store_id, storefront_store_id_source: "public_storefront" }.
  // That reaches an external site, so it is intentionally not ported yet —
  // plug the discovery here.

  return {
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

  // Widget types outside the enum can never exist, so skip the query (the
  // original's text column simply returned no row for them).
  const widget = isWidgetType(widgetType)
    ? await prisma.widget.findFirst({
        where: { store_id: store.id, type: widgetType, status: "active" },
        select: { id: true, type: true, status: true, settings: true },
      })
    : null;
  const effectiveWidget = enforceWidgetPlanLimits(widget, store);

  const videos = mode === "meta" ? [] : await loadVideos(store.id, mode);

  const upzeroConfig =
    clean(store.platform).toLowerCase() === "upzero" ? await buildUpzeroConfig(store) : null;

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
