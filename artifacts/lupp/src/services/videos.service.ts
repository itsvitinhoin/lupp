import { requireSupabase } from "@/lib/supabase";
import type { VideoStatus } from "@/types/database";
import type { CreateVideoPayload, UpdateVideoPayload } from "@/types/video";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function productKeyFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    const path = new URL(value, window.location.origin).pathname;
    const match = path.match(
      /\/(?:produto|produtos|product|products)\/([^/]+)/i,
    );
    const handle = match ? decodeURIComponent(match[1]).toLowerCase() : "";
    return handle.match(/^\d+/)?.[0] ?? handle;
  } catch (_) {
    return "";
  }
}

function primaryProduct(video: any) {
  return (
    video.video_products?.find((item: any) => item.is_primary)?.products ??
    video.video_products?.[0]?.products ??
    null
  );
}

function productMatchesUrl(product: any, productUrl?: string | null) {
  const sourceKey = productKeyFromUrl(productUrl);
  const productKey = productKeyFromUrl(product?.product_url);
  return Boolean(sourceKey && productKey && sourceKey === productKey);
}

function uniqueVideos(videos: any[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    if (!video?.id || seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    return String(
      details.message ||
        details.error ||
        details.details ||
        details.hint ||
        "Erro desconhecido",
    );
  }
  return String(error || "Erro desconhecido");
}

function toError(error: unknown, fallback: string) {
  const message = errorMessage(error);
  return new Error(message === "Erro desconhecido" ? fallback : message);
}

function uniqueProductIds(productIds: string[]) {
  return Array.from(
    new Set(productIds.map((productId) => productId.trim()).filter(Boolean)),
  );
}

function storagePathFromPublicUrl(
  publicUrl?: string | null,
  bucket = "videos",
) {
  if (!publicUrl) return "";
  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.pathname.indexOf(marker);
    if (index === -1) return "";
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch (_) {
    return "";
  }
}

async function appendVideoMetrics(
  supabase: any,
  storeId: string,
  videos: any[],
) {
  const videoIds = videos.map((video) => video.id).filter(Boolean);
  if (!videoIds.length) return videos;

  const [eventsResult, likesResult, commentsResult] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("video_id, event_type, metadata")
      .eq("store_id", storeId)
      .in("video_id", videoIds),
    supabase
      .from("video_likes")
      .select("video_id")
      .eq("store_id", storeId)
      .in("video_id", videoIds),
    supabase
      .from("comments")
      .select("video_id")
      .eq("store_id", storeId)
      .neq("status", "deleted")
      .in("video_id", videoIds),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const metricsByVideo = new Map<
    string,
    {
      clicks: number;
      comments: number;
      likes: number;
      revenue: number;
      views: number;
    }
  >();
  const likesByVideo = new Map<string, number>();

  const ensureMetrics = (videoId: string) => {
    const current = metricsByVideo.get(videoId) ?? {
      clicks: 0,
      comments: 0,
      likes: 0,
      revenue: 0,
      views: 0,
    };
    metricsByVideo.set(videoId, current);
    return current;
  };

  for (const event of eventsResult.data ?? []) {
    if (!event.video_id) continue;
    const metrics = ensureMetrics(event.video_id);
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
    const revenue = Number(
      metadata.revenue ?? metadata.order_value ?? metadata.amount ?? 0,
    );
    if (Number.isFinite(revenue) && revenue > 0) metrics.revenue += revenue;
  }

  for (const like of likesResult.data ?? []) {
    if (!like.video_id) continue;
    likesByVideo.set(like.video_id, (likesByVideo.get(like.video_id) ?? 0) + 1);
  }

  for (const comment of commentsResult.data ?? []) {
    if (!comment.video_id) continue;
    ensureMetrics(comment.video_id).comments += 1;
  }

  for (const [videoId, likes] of likesByVideo) {
    ensureMetrics(videoId).likes = likes;
  }

  return videos.map((video) => ({
    ...video,
    likes: ensureMetrics(video.id).likes,
    comments_count: ensureMetrics(video.id).comments,
    metrics: ensureMetrics(video.id),
  }));
}

export const videosService = {
  async listVideos(storeId: string, search = "", status = "all") {
    const supabase = requireSupabase();
    let query = requireSupabase()
      .from("videos")
      .select("*, video_products(*, products(*, product_variants(*)))")
      .eq("store_id", storeId)
      .neq("status", "deleted")
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (search) query = query.ilike("title", `%${search}%`);
    if (status !== "all") query = query.eq("status", status as VideoStatus);

    const { data, error } = await query;
    if (error) throw error;
    const videos = data ?? [];
    return appendVideoMetrics(supabase, storeId, videos);
  },

  async listPublicFeedVideosByStoreSlug(
    storeSlug: string,
    includeVideoId?: string | null,
    contextualProductUrl?: string | null,
  ) {
    const supabase = requireSupabase();
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("slug", storeSlug)
      .eq("status", "active")
      .single();
    if (storeError) throw storeError;

    const { data: widget, error: widgetError } = await supabase
      .from("widgets")
      .select("settings")
      .eq("store_id", store.id)
      .eq("type", "floating_video")
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (widgetError) throw widgetError;

    const settings = asRecord(widget?.settings);
    const display = asRecord(settings.display);
    const ordering =
      display.home_ordering === "automatic" ? "automatic" : "manual";
    const videos = await this.listPublicFeedVideos(
      store.id,
      ordering,
      includeVideoId,
      contextualProductUrl,
    );
    return {
      feed_options: asRecord(settings.feed_options),
      store: {
        ...store,
        widget_settings: settings,
      },
      videos,
    };
  },

  async listPublicFeedVideos(
    storeId: string,
    ordering: "manual" | "automatic" = "manual",
    includeVideoId?: string | null,
    contextualProductUrl?: string | null,
  ) {
    const supabase = requireSupabase();
    let query = supabase
      .from("videos")
      .select("*, video_products(*, products(*, product_variants(*)))")
      .eq("store_id", storeId)
      .eq("status", "active")
      .eq("processing_status", "ready")
      .eq("is_feed_enabled", true);

    query = query.order("is_featured", { ascending: false });
    query =
      ordering === "automatic"
        ? query.order("created_at", { ascending: false })
        : query.order("sort_order").order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    const feedVideos = (data ?? []) as any[];

    if (!includeVideoId && !contextualProductUrl) {
      return appendVideoMetrics(supabase, storeId, feedVideos);
    }

    let contextualVideo: any = null;
    if (includeVideoId) {
      const { data, error: contextualError } = await supabase
        .from("videos")
        .select("*, video_products(*, products(*, product_variants(*)))")
        .eq("store_id", storeId)
        .eq("status", "active")
        .eq("processing_status", "ready")
        .eq("id", includeVideoId)
        .maybeSingle();
      if (contextualError) throw contextualError;
      contextualVideo = data;
    }

    const sourceProductUrl =
      contextualProductUrl ||
      primaryProduct(contextualVideo)?.product_url ||
      null;

    let relatedVideos: any[] = contextualVideo ? [contextualVideo] : [];
    if (sourceProductUrl) {
      const { data: productPageVideos, error: productVideosError } =
        await supabase
          .from("videos")
          .select("*, video_products(*, products(*, product_variants(*)))")
          .eq("store_id", storeId)
          .eq("status", "active")
          .eq("processing_status", "ready")
          .eq("is_product_page_enabled", true)
          .order("sort_order")
          .order("created_at", { ascending: false });
      if (productVideosError) throw productVideosError;

      relatedVideos = uniqueVideos([
        ...relatedVideos,
        ...((productPageVideos ?? []) as any[]).filter((video) =>
          productMatchesUrl(primaryProduct(video), sourceProductUrl),
        ),
      ]);
    }

    return appendVideoMetrics(
      supabase,
      storeId,
      uniqueVideos([...relatedVideos, ...feedVideos]),
    );
  },

  async createVideo(payload: CreateVideoPayload, productIds: string[] = []) {
    const supabase = requireSupabase();
    const { data: video, error } = await supabase
      .from("videos")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw toError(error, "Não foi possível criar o vídeo.");

    const normalizedProductIds = uniqueProductIds(productIds);

    if (normalizedProductIds.length) {
      try {
        for (const [index, productId] of normalizedProductIds.entries()) {
          const { error: linkError } = await supabase
            .from("video_products")
            .insert({
              video_id: video.id,
              product_id: productId,
              is_primary: index === 0,
            });

          if (linkError) {
            throw toError(
              linkError,
              "Não foi possível vincular os produtos ao vídeo.",
            );
          }
        }
      } catch (linkError) {
        await supabase.from("videos").delete().eq("id", video.id);
        throw linkError instanceof Error
          ? linkError
          : toError(linkError, "Não foi possível vincular os produtos ao vídeo.");
      }
    }

    return video;
  },

  async updateVideo(videoId: string, payload: UpdateVideoPayload) {
    const { data, error } = await requireSupabase()
      .from("videos")
      .update(payload)
      .eq("id", videoId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async archiveVideo(videoId: string) {
    return this.updateVideo(videoId, { status: "archived" });
  },

  async deleteVideo(videoId: string, storeId: string) {
    const supabase = requireSupabase();
    const { data: video, error: readError } = await supabase
      .from("videos")
      .select(
        "id,store_id,provider,provider_video_id,video_url,playback_url,thumbnail_url",
      )
      .eq("id", videoId)
      .eq("store_id", storeId)
      .single();
    if (readError) {
      throw toError(readError, "Não foi possível localizar o vídeo.");
    }

    if (video.provider === "bunny") {
      const { error } = await supabase.functions.invoke("bunny-delete-video", {
        body: { store_id: storeId, video_id: videoId },
      });
      if (error) {
        throw toError(error, "Não foi possível excluir o vídeo na Bunny.");
      }
    } else {
      const videoPath =
        storagePathFromPublicUrl(video.video_url, "videos") ||
        storagePathFromPublicUrl(video.playback_url, "videos");
      if (videoPath) {
        const { error } = await supabase.storage
          .from("videos")
          .remove([videoPath]);
        if (error) {
          throw toError(error, "Não foi possível remover o arquivo do vídeo.");
        }
      }
    }

    const thumbnailPath = storagePathFromPublicUrl(
      video.thumbnail_url,
      "thumbnails",
    );
    if (thumbnailPath) {
      await supabase.storage.from("thumbnails").remove([thumbnailPath]);
    }

    await supabase.from("video_products").delete().eq("video_id", videoId);
    const { error: deleteError } = await supabase
      .from("videos")
      .delete()
      .eq("id", videoId)
      .eq("store_id", storeId);

    if (deleteError) {
      const { error: fallbackError } = await supabase
        .from("videos")
        .update({ status: "deleted", processing_status: "archived" })
        .eq("id", videoId)
        .eq("store_id", storeId);
      if (fallbackError) {
        throw toError(fallbackError, "Não foi possível excluir o vídeo.");
      }
    }
  },

  async duplicateVideo(videoId: string) {
    const supabase = requireSupabase();
    const { data: source, error } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .single();
    if (error) throw error;

    const {
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...copy
    } = source;
    return this.createVideo({
      ...copy,
      title: `${source.title} (cópia)`,
      status: "draft",
    });
  },

  async replaceVideoProducts(videoId: string, productIds: string[]) {
    const supabase = requireSupabase();
    const deleteResult = await supabase
      .from("video_products")
      .delete()
      .eq("video_id", videoId);
    if (deleteResult.error) {
      throw toError(
        deleteResult.error,
        "Não foi possível atualizar os produtos do vídeo.",
      );
    }

    const normalizedProductIds = uniqueProductIds(productIds);
    if (!normalizedProductIds.length) return;

    for (const [index, productId] of normalizedProductIds.entries()) {
      const { error } = await supabase
        .from("video_products")
        .insert({
          video_id: videoId,
          product_id: productId,
          is_primary: index === 0,
        });

      if (error) {
        throw toError(
          error,
          "Não foi possível atualizar os produtos do vídeo.",
        );
      }
    }
  },

  async updateVideoOrdering(
    updates: Array<{ id: string; is_featured: boolean; sort_order: number }>,
  ) {
    const supabase = requireSupabase();
    await Promise.all(
      updates.map((item) =>
        supabase
          .from("videos")
          .update({
            is_featured: item.is_featured,
            sort_order: item.sort_order,
          })
          .eq("id", item.id)
          .throwOnError(),
      ),
    );
  },
};
