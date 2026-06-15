import { PLAN_LIMITS } from "@/lib/constants";
import { requireSupabase } from "@/lib/supabase";
import type { PlanId, UsageSnapshot } from "@/types/billing";

export const billingService = {
  async getCurrentSubscription(storeId: string) {
    const { data, error } = await requireSupabase()
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getUsage(storeId: string): Promise<UsageSnapshot> {
    const supabase = requireSupabase();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [activeVideos, monthViews, activeWidgets] = await Promise.all([
      supabase.from("videos").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active"),
      supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("event_type", "video_view").gte("created_at", monthStart.toISOString()),
      supabase.from("widgets").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "active"),
    ]);

    return {
      activeVideos: activeVideos.count ?? 0,
      monthViews: monthViews.count ?? 0,
      activeWidgets: activeWidgets.count ?? 0,
    };
  },

  canCreateActiveVideo(planId: PlanId, usage: UsageSnapshot) {
    return usage.activeVideos < PLAN_LIMITS[planId].videoLimit;
  },

  isNearViewLimit(planId: PlanId, usage: UsageSnapshot) {
    return usage.monthViews >= PLAN_LIMITS[planId].viewLimit * 0.8;
  },

  async requestUpgrade() {
    return { ok: true, message: "Integração de pagamento em breve." };
  },
};
