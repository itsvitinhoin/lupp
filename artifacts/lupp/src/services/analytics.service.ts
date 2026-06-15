import { requireSupabase } from "@/lib/supabase";
import type { DashboardMetrics, TrackEventPayload, TrackingContext } from "@/types/analytics";

export function getOrCreateVisitorId() {
  const key = "lupp_visitor_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const visitorId = crypto.randomUUID();
  localStorage.setItem(key, visitorId);
  return visitorId;
}

export function getOrCreateSessionId() {
  const key = "lupp_session_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

export const analyticsService = {
  async trackEvent(payload: TrackEventPayload, context?: TrackingContext) {
    const { error } = await requireSupabase()
      .from("analytics_events")
      .insert({
        ...payload,
        visitor_id: payload.visitor_id ?? context?.visitorId ?? getOrCreateVisitorId(),
        session_id: payload.session_id ?? context?.sessionId ?? getOrCreateSessionId(),
        url: payload.url ?? context?.url ?? window.location.href,
        referrer: payload.referrer ?? context?.referrer ?? (document.referrer || null),
        user_agent: payload.user_agent ?? context?.userAgent ?? navigator.userAgent,
        metadata: payload.metadata ?? {},
      });
    if (error) throw error;
  },

  async getDashboardMetrics(storeId: string): Promise<DashboardMetrics> {
    const supabase = requireSupabase();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ count: activeVideos }, { count: totalLikes }, { count: pendingComments }, eventsResult] = await Promise.all([
      supabase.from("videos").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active"),
      supabase.from("video_likes").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "pending"),
      supabase.from("analytics_events").select("event_type, metadata").eq("store_id", storeId).gte("created_at", monthStart.toISOString()),
    ]);

    if (eventsResult.error) throw eventsResult.error;

    const events = eventsResult.data ?? [];
    const views = events.filter((event) => event.event_type === "video_view").length;
    const productClicks = events.filter((event) => event.event_type === "product_click").length;
    const addToCart = events.filter((event) => event.event_type === "add_to_cart_click").length;
    const attributedRevenue = events.reduce((sum, event) => {
      const metadata = event.metadata;
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.value === "number") {
        return sum + metadata.value;
      }
      return sum;
    }, 0);

    return {
      views,
      productClicks,
      ctr: views > 0 ? productClicks / views : 0,
      addToCart,
      attributedRevenue,
      activeVideos: activeVideos ?? 0,
      totalLikes: totalLikes ?? 0,
      pendingComments: pendingComments ?? 0,
    };
  },
};
