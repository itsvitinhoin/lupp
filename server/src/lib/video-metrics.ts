import { prisma, dbSchema } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma/client";

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

  // Counts and the revenue sum are aggregated in Postgres — this used to
  // load every analytics row for the requested videos into JS on the public
  // feed's hot path. Revenue parses metadata.revenue|order_value|amount when
  // it looks like a plain positive decimal (the old JS Number() also accepted
  // exotic formats like "1e3"; those are intentionally ignored now).
  const [events, likes, comments] = await Promise.all([
    prisma.$queryRaw<
      { video_id: string; event_type: string; count: number; revenue: number }[]
    >`
      SELECT
        video_id,
        event_type::text AS event_type,
        count(*)::int AS count,
        COALESCE(SUM(CASE
          WHEN COALESCE(metadata->>'revenue', metadata->>'order_value', metadata->>'amount')
            ~ '^\\d+(\\.\\d+)?$'
          THEN COALESCE(metadata->>'revenue', metadata->>'order_value', metadata->>'amount')::numeric
          ELSE 0
        END), 0)::float8 AS revenue
      FROM ${Prisma.raw(`"${dbSchema.replace(/"/g, "")}".analytics_events`)}
      WHERE store_id = ${storeId}
        AND video_id IN (${Prisma.join(videoIds)})
      GROUP BY 1, 2
    `,
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

  for (const row of events) {
    const metrics = ensure(row.video_id);
    if (row.event_type === "video_view") metrics.views += row.count;
    if (
      row.event_type === "product_click" ||
      row.event_type === "add_to_cart_click" ||
      row.event_type === "share_click"
    ) {
      metrics.clicks += row.count;
    }
    if (row.event_type === "like_click") metrics.likes += row.count;
    if (row.revenue > 0) metrics.revenue += row.revenue;
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
