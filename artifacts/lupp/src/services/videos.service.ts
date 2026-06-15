import { requireSupabase } from "@/lib/supabase";
import type { VideoStatus } from "@/types/database";
import type { CreateVideoPayload, UpdateVideoPayload } from "@/types/video";

export const videosService = {
  async listVideos(storeId: string, search = "", status = "all") {
    let query = requireSupabase()
      .from("videos")
      .select("*, video_products(*, products(*))")
      .eq("store_id", storeId)
      .order("sort_order")
      .order("created_at", { ascending: false });

    if (search) query = query.ilike("title", `%${search}%`);
    if (status !== "all") query = query.eq("status", status as VideoStatus);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async listPublicFeedVideosByStoreSlug(storeSlug: string) {
    const supabase = requireSupabase();
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("slug", storeSlug)
      .eq("status", "active")
      .single();
    if (storeError) throw storeError;

    const videos = await this.listPublicFeedVideos(store.id);
    return { store, videos };
  },

  async listPublicFeedVideos(storeId: string) {
    const { data, error } = await requireSupabase()
      .from("videos")
      .select("*, video_products(*, products(*))")
      .eq("store_id", storeId)
      .eq("status", "active")
      .eq("is_feed_enabled", true)
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createVideo(payload: CreateVideoPayload, productIds: string[] = []) {
    const supabase = requireSupabase();
    const { data: video, error } = await supabase.from("videos").insert(payload).select("*").single();
    if (error) throw error;

    if (productIds.length) {
      await supabase
        .from("video_products")
        .insert(productIds.map((productId, index) => ({ video_id: video.id, product_id: productId, is_primary: index === 0 })))
        .throwOnError();
    }

    return video;
  },

  async updateVideo(videoId: string, payload: UpdateVideoPayload) {
    const { data, error } = await requireSupabase().from("videos").update(payload).eq("id", videoId).select("*").single();
    if (error) throw error;
    return data;
  },

  async archiveVideo(videoId: string) {
    return this.updateVideo(videoId, { status: "archived" });
  },

  async duplicateVideo(videoId: string) {
    const supabase = requireSupabase();
    const { data: source, error } = await supabase.from("videos").select("*").eq("id", videoId).single();
    if (error) throw error;

    const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...copy } = source;
    return this.createVideo({ ...copy, title: `${source.title} (cópia)`, status: "draft" });
  },

  async replaceVideoProducts(videoId: string, productIds: string[]) {
    const supabase = requireSupabase();
    await supabase.from("video_products").delete().eq("video_id", videoId).throwOnError();
    if (!productIds.length) return;

    await supabase
      .from("video_products")
      .insert(productIds.map((productId, index) => ({ video_id: videoId, product_id: productId, is_primary: index === 0 })))
      .throwOnError();
  },
};
