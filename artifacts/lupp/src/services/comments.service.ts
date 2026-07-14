import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { TableUpdate } from "@/types/database";

export const commentsService = {
  async listComments(storeId: string, status = "all") {
    const params = new URLSearchParams({ store_id: storeId });
    if (status !== "all") params.set("status", status);

    const data = await apiGet<{ comments: any[] }>(`/api/comments?${params}`);
    return data.comments ?? [];
  },

  async listApprovedByVideo(videoId: string) {
    const params = new URLSearchParams({ video_id: videoId });
    const data = await apiGet<{ comments: any[] }>(`/api/comments/public?${params}`);
    return data.comments ?? [];
  },

  async createPublicComment(payload: {
    storeId: string;
    videoId: string;
    authorName: string;
    authorEmail?: string;
    body: string;
  }) {
    await apiPost("/api/comments/public", {
      store_id: payload.storeId,
      video_id: payload.videoId,
      author_name: payload.authorName,
      author_email: payload.authorEmail || null,
      body: payload.body,
    });
  },

  async updateComment(commentId: string, updates: TableUpdate<"comments">) {
    const data = await apiPatch<{ comment: any }>(
      `/api/comments/${commentId}`,
      updates as Record<string, unknown>,
    );
    return data.comment;
  },

  async deleteComment(commentId: string) {
    await apiDelete(`/api/comments/${commentId}`);
  },
};
