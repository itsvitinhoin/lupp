import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { CreateVideoPayload, UpdateVideoPayload } from "@/types/video";

function uniqueProductIds(productIds: string[]) {
  return Array.from(
    new Set(productIds.map((productId) => productId.trim()).filter(Boolean)),
  );
}

export const videosService = {
  async listVideos(storeId: string, search = "", status = "all") {
    const params = new URLSearchParams({ store_id: storeId });
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);

    const { videos } = await apiGet<{ videos: any[] }>(`/api/videos?${params}`);
    if (!videos?.length) return [];

    // Per-video engagement counters are aggregated server-side.
    const metricsParams = new URLSearchParams({
      store_id: storeId,
      video_ids: videos.map((video) => video.id).join(","),
    });
    const { metrics } = await apiGet<{
      metrics: Array<{
        video_id: string;
        views: number;
        clicks: number;
        likes: number;
        comments: number;
        revenue: number;
      }>;
    }>(`/api/videos/metrics?${metricsParams}`);
    const metricsByVideo = new Map(metrics.map((entry) => [entry.video_id, entry]));

    return videos.map((video) => {
      const entry = metricsByVideo.get(video.id);
      const { video_id: _videoId, ...videoMetrics } = entry ?? {
        video_id: video.id,
        views: 0,
        clicks: 0,
        likes: 0,
        comments: 0,
        revenue: 0,
      };
      return {
        ...video,
        likes: videoMetrics.likes,
        comments_count: videoMetrics.comments,
        metrics: videoMetrics,
      };
    });
  },

  // The store/widget/ordering/contextual-merge cascade runs server-side now.
  async listPublicFeedVideosByStoreSlug(
    storeSlug: string,
    includeVideoId?: string | null,
    contextualProductUrl?: string | null,
  ) {
    const params = new URLSearchParams({ store_slug: storeSlug });
    if (includeVideoId) params.set("include_video_id", includeVideoId);
    if (contextualProductUrl) params.set("product_url", contextualProductUrl);

    const data = await apiGet<{
      active: boolean;
      error?: string;
      feed_options: Record<string, any>;
      store: any;
      videos: any[];
    }>(`/api/feed?${params}`);

    if (!data.active || !data.store) {
      throw new Error(
        data.error === "trial_expired"
          ? "O período de teste desta loja terminou."
          : "Loja não encontrada.",
      );
    }

    return {
      feed_options: data.feed_options ?? {},
      store: data.store,
      videos: data.videos ?? [],
    };
  },

  async createVideo(payload: CreateVideoPayload, productIds: string[] = []) {
    // Row + product links (first id primary) are created transactionally.
    const data = await apiPost<{ video: any }>("/api/videos", {
      ...payload,
      product_ids: uniqueProductIds(productIds),
    });
    return data.video;
  },

  async updateVideo(videoId: string, payload: UpdateVideoPayload) {
    const data = await apiPatch<{ video: any }>(
      `/api/videos/${videoId}`,
      payload as Record<string, unknown>,
    );
    return data.video;
  },

  async archiveVideo(videoId: string) {
    return this.updateVideo(videoId, { status: "archived" });
  },

  async deleteVideo(videoId: string, storeId: string) {
    // The server deletes the provider asset (Bunny), the thumbnail, the
    // product links and the row (soft-delete fallback) in one call.
    await apiPost<{ ok: boolean }>("/api/videos/delete", {
      store_id: storeId,
      video_id: videoId,
    });
  },

  async duplicateVideo(videoId: string) {
    const { video: source } = await apiGet<{ video: any }>(`/api/videos/${videoId}`);
    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      video_products: _links,
      likes: _likes,
      comments_count: _comments,
      metrics: _metrics,
      ...copy
    } = source;
    return this.createVideo({
      ...copy,
      title: `${source.title} (cópia)`,
      status: "draft",
    });
  },

  async replaceVideoProducts(videoId: string, productIds: string[]) {
    await apiPatch(`/api/videos/${videoId}`, {
      product_ids: uniqueProductIds(productIds),
    });
  },

  async updateVideoOrdering(
    storeId: string,
    updates: Array<{ id: string; is_featured: boolean; sort_order: number }>,
  ) {
    if (!updates.length) return;
    await apiPatch("/api/videos/ordering", { store_id: storeId, updates });
  },
};
