import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { storeHasBillingAccess } from "@/lib/billing-access";
import { attachVideoMetrics, getVideoMetrics } from "@/lib/video-metrics";
import { serializeVideo, VIDEO_PRODUCTS_INCLUDE, type VideoRow } from "@/lib/serialize";
import { edgeErrorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";
import { Prisma } from "../../../generated/prisma/client";

const QuerySchema = z.object({
  store_slug: z.string().optional(),
  store_id: z.string().optional(),
  include_video_id: z
    .string()
    .optional()
    .describe("Contextual video pinned to the top of the feed."),
  product_url: z
    .string()
    .optional()
    .describe("Product page URL for contextual product-video matching."),
});

const FeedResponseSchema = z
  .object({
    active: z.boolean(),
    error: z.string().optional(),
    feed_options: z.any(),
    store: z.any().nullable(),
    videos: z.array(z.any()),
  })
  .loose();

export const GetFeedSchema = {
  schema: {
    summary: "Public vertical feed",
    description:
      "Feed videos for the public /s/:slug/feed experience: resolves the " +
      "active store by slug or id, gates on billing access (active:false + " +
      "trial_expired), applies the floating widget's ordering settings, " +
      "merges contextual videos (include_video_id / product_url match) ahead " +
      "of the feed and attaches per-video like/comment metrics.",
    tags: ["feed"],
    operationId: "getPublicFeed",
    querystring: QuerySchema,
    response: {
      200: FeedResponseSchema,
      ...edgeErrorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Port of the SPA's productKeyFromUrl: the product handle (or its numeric
// prefix) from /produto|produtos|product|products/<handle> paths.
function productKeyFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    const path = new URL(value, "https://storefront.invalid").pathname;
    const match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
    const handle = match ? decodeURIComponent(match[1]).toLowerCase() : "";
    return handle.match(/^\d+/)?.[0] ?? handle;
  } catch {
    return "";
  }
}

type SerializedVideo = Record<string, unknown> & {
  id?: unknown;
  video_products?: Array<{ is_primary: boolean; products: Record<string, unknown> }>;
};

function primaryProduct(video: SerializedVideo | null) {
  if (!video?.video_products?.length) return null;
  return (
    video.video_products.find((item) => item.is_primary)?.products ??
    video.video_products[0]?.products ??
    null
  );
}

function uniqueVideos(videos: SerializedVideo[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    const id = String(video?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const FEED_BASE_WHERE = {
  status: "active",
  processing_status: "ready",
} satisfies Prisma.VideoWhereInput;

export async function getFeedHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});
  const slug = query.store_slug?.trim();
  const storeId = query.store_id?.trim();
  if (!slug && !storeId) {
    return reply.status(400).send({ error: "missing_store_identifier" });
  }

  const store = await prisma.store.findFirst({
    where: storeId ? { id: storeId, status: "active" } : { slug, status: "active" },
  });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  if (!(await storeHasBillingAccess(store.id))) {
    return reply.status(200).send({
      active: false,
      error: "trial_expired",
      feed_options: {},
      store: null,
      videos: [],
    });
  }

  const widget = await prisma.widget.findFirst({
    where: { store_id: store.id, type: "floating_video", status: "active" },
    orderBy: { created_at: "asc" },
    select: { settings: true },
  });
  const settings = asRecord(widget?.settings);
  const display = asRecord(settings.display);
  const ordering = display.home_ordering === "automatic" ? "automatic" : "manual";

  const orderBy: Prisma.VideoOrderByWithRelationInput[] = [
    { is_featured: "desc" },
    ...(ordering === "automatic"
      ? [{ created_at: "desc" as const }]
      : [{ sort_order: "asc" as const }, { created_at: "desc" as const }]),
  ];

  const feedRows = await prisma.video.findMany({
    where: { ...FEED_BASE_WHERE, store_id: store.id, is_feed_enabled: true },
    orderBy,
    include: VIDEO_PRODUCTS_INCLUDE,
  });
  const feedVideos = feedRows.map((row) =>
    serializeVideo(row as unknown as VideoRow),
  ) as SerializedVideo[];

  // Contextual videos ride ahead of the feed: the explicitly requested video
  // first, then product-page videos whose primary product matches the URL.
  let merged = feedVideos;
  const includeVideoId = query.include_video_id?.trim();
  const contextualProductUrl = query.product_url?.trim();

  if (includeVideoId || contextualProductUrl) {
    let contextualVideo: SerializedVideo | null = null;
    if (includeVideoId) {
      const row = await prisma.video.findFirst({
        where: { ...FEED_BASE_WHERE, id: includeVideoId, store_id: store.id },
        include: VIDEO_PRODUCTS_INCLUDE,
      });
      contextualVideo = row ? (serializeVideo(row as unknown as VideoRow) as SerializedVideo) : null;
    }

    const sourceProductUrl =
      contextualProductUrl ||
      (primaryProduct(contextualVideo)?.product_url as string | undefined) ||
      null;

    let relatedVideos: SerializedVideo[] = contextualVideo ? [contextualVideo] : [];
    if (sourceProductUrl) {
      const sourceKey = productKeyFromUrl(sourceProductUrl);
      if (sourceKey) {
        const productRows = await prisma.video.findMany({
          where: { ...FEED_BASE_WHERE, store_id: store.id, is_product_page_enabled: true },
          orderBy: [{ sort_order: "asc" }, { created_at: "desc" }],
          include: VIDEO_PRODUCTS_INCLUDE,
        });
        const matching = productRows
          .map((row) => serializeVideo(row as unknown as VideoRow) as SerializedVideo)
          .filter((video) => {
            const productKey = productKeyFromUrl(
              primaryProduct(video)?.product_url as string | undefined,
            );
            return Boolean(productKey && productKey === sourceKey);
          });
        relatedVideos = uniqueVideos([...relatedVideos, ...matching]);
      }
    }

    merged = uniqueVideos([...relatedVideos, ...feedVideos]);
  }

  const metrics = await getVideoMetrics(
    store.id,
    merged.map((video) => String(video.id)),
  );

  return reply.status(200).send({
    active: true,
    feed_options: asRecord(settings.feed_options),
    store: { ...store, widget_settings: settings },
    videos: attachVideoMetrics(merged, metrics),
  });
}
