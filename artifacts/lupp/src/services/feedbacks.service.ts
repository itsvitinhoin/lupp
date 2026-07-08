import { requireSupabase } from "@/lib/supabase";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export type VideoFeedback = {
  id: string;
  comment: string;
  createdAt: string;
  option: string;
  rating: number;
  videoId: string | null;
  videoTitle: string;
};

export const feedbacksService = {
  async listFeedbacks(storeId: string): Promise<VideoFeedback[]> {
    const { data, error } = await requireSupabase()
      .from("analytics_events")
      .select("id, video_id, metadata, created_at, videos(title)")
      .eq("store_id", storeId)
      .eq("event_type", "widget_view")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data ?? [])
      .map((event: any) => {
        const metadata = asRecord(event.metadata);
        if (metadata.action !== "feedback_submit") return null;
        return {
          comment: String(metadata.feedback_text || "").trim(),
          createdAt: event.created_at,
          id: event.id,
          option: String(metadata.feedback_option || "Sem opção"),
          rating: Number(metadata.feedback_rating || 0),
          videoId: event.video_id ?? null,
          videoTitle: event.videos?.title || "Vídeo sem título",
        };
      })
      .filter(Boolean) as VideoFeedback[];
  },
};
