import { requireSupabase } from "@/lib/supabase";
import type { CommentStatus, TableUpdate } from "@/types/database";

export const commentsService = {
  async listComments(storeId: string, status = "all") {
    let query = requireSupabase()
      .from("comments")
      .select("*, videos(title, video_products(products(name)))")
      .eq("store_id", storeId)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status as CommentStatus);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async listApprovedByVideo(videoId: string) {
    const { data, error } = await requireSupabase()
      .from("comments")
      .select("id, author_name, body, created_at")
      .eq("video_id", videoId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createPublicComment(payload: {
    storeId: string;
    videoId: string;
    authorName: string;
    authorEmail?: string;
    body: string;
  }) {
    const { error } = await requireSupabase()
      .from("comments")
      .insert({
        store_id: payload.storeId,
        video_id: payload.videoId,
        author_name: payload.authorName,
        author_email: payload.authorEmail || null,
        body: payload.body,
        status: "pending",
      });
    if (error) throw error;
  },

  async updateComment(commentId: string, updates: TableUpdate<"comments">) {
    const { data, error } = await requireSupabase()
      .from("comments")
      .update(updates)
      .eq("id", commentId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async deleteComment(commentId: string) {
    const { error } = await requireSupabase()
      .from("comments")
      .delete()
      .eq("id", commentId);
    if (error) throw error;
  },
};
