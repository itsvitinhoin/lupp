import { prisma } from "@/lib/prisma";

/**
 * Per-video engagement counters, ported from the SPA's appendVideoMetrics
 * (analytics_events + video_likes + comments in one pass). Used by the admin
 * videos metrics endpoint and the public feed.
 */

export type VideoMetrics = {
  views: number;
  clicks: number;
  likes: number;
  comments: number;
  revenue: number;
};

export function emptyVideoMetrics(): VideoMetrics {
  return { views: 0, clicks: 0, likes: 0, comments: 0, revenue: 0 };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getVideoMetrics(
  storeId: string,
  videoIds: string[],
): Promise<Map<string, VideoMetrics>> {
  const metricsByVideo = new Map<string, VideoMetrics>();
  if (!videoIds.length) return metricsByVideo;

  const ensure = (videoId: string) => {
    const current = metricsByVideo.get(videoId) ?? emptyVideoMetrics();
    metricsByVideo.set(videoId, current);
    return current;
  };

  const [events, likes, comments] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { store_id: storeId, video_id: { in: videoIds } },
      select: { video_id: true, event_type: true, metadata: true },
    }),
    prisma.videoLike.groupBy({
      by: ["video_id"],
      where: { store_id: storeId, video_id: { in: videoIds } },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ["video_id"],
      where: { store_id: storeId, video_id: { in: videoIds }, status: { not: "deleted" } },
      _count: { _all: true },
    }),
  ]);

  for (const event of events) {
    if (!event.video_id) continue;
    const metrics = ensure(event.video_id);
    if (event.event_type === "video_view") metrics.views += 1;
    if (
      event.event_type === "product_click" ||
      event.event_type === "add_to_cart_click" ||
      event.event_type === "share_click"
    ) {
      metrics.clicks += 1;
    }
    if (event.event_type === "like_click") metrics.likes += 1;

    const metadata = asRecord(event.metadata);
    const revenue = Number(metadata.revenue ?? metadata.order_value ?? metadata.amount ?? 0);
    if (Number.isFinite(revenue) && revenue > 0) metrics.revenue += revenue;
  }

  // Real like rows win over the like_click event fallback.
  for (const like of likes) {
    ensure(like.video_id).likes = like._count._all;
  }

  for (const comment of comments) {
    ensure(comment.video_id).comments = comment._count._all;
  }

  return metricsByVideo;
}

/** Decorates serialized video rows the way the SPA's appendVideoMetrics did. */
export function attachVideoMetrics<T extends { id?: unknown }>(
  videos: T[],
  metricsByVideo: Map<string, VideoMetrics>,
) {
  return videos.map((video) => {
    const metrics = metricsByVideo.get(String(video.id)) ?? emptyVideoMetrics();
    return { ...video, likes: metrics.likes, comments_count: metrics.comments, metrics };
  });
}
