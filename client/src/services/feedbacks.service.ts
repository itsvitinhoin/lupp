import { asRecord } from "@/lib/utils";
import { apiGet } from "@/lib/api";

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
    const params = new URLSearchParams({
      store_id: storeId,
      // Feedbacks are widget_view events with metadata.action=feedback_submit;
      // the API caps the window at 92 days back.
      since: new Date(0).toISOString(),
      event_types: "widget_view",
      fields: "feedbacks",
    });
    const data = await apiGet<{ events: any[] }>(`/api/analytics/events?${params}`);

    return (data.events ?? [])
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
