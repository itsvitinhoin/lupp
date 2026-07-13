import { apiPost, type Humanizer } from "@/lib/api";
import { countBillableWidgets, PLAN_LIMITS } from "@/lib/constants";
import { requireSupabase } from "@/lib/supabase";
import type {
  BillingEventSummary,
  BillingUsageTrendPoint,
  DiscountCoupon,
  LuppSubscription,
  PlanId,
  UsageSnapshot,
} from "@/types/billing";

const TRACKED_EVENT_TYPES = [
  "video_view",
  "product_click",
  "add_to_cart_click",
  "share_click",
] as const;

type TrackedEventType = (typeof TRACKED_EVENT_TYPES)[number];

type MonthlyUsageRpcRow = {
  active_videos?: number | null;
  active_widgets?: number | null;
  month_views?: number | null;
};

type MonthlyUsageRpcClient = {
  rpc: (
    functionName: "get_store_monthly_usage",
    args: { check_store_id: string },
  ) => {
    maybeSingle: () => Promise<{
      data: MonthlyUsageRpcRow | null;
      error: unknown | null;
    }>;
  };
};

async function getActiveWidgetUsage(
  supabase: ReturnType<typeof requireSupabase>,
  storeId: string,
) {
  const { data, error } = await supabase
    .from("widgets")
    .select("type,status,settings")
    .eq("store_id", storeId)
    .eq("status", "active");

  if (error) throw error;
  return countBillableWidgets(data ?? []);
}

export type LuupCheckoutCustomer = {
  address: string;
  addressNumber: string;
  city?: string;
  complement?: string;
  cpfCnpj: string;
  email: string;
  name: string;
  phone?: string;
  postalCode: string;
  province: string;
  state?: string;
};

export type LuupCheckoutCard = {
  ccv: string;
  expiryMonth: string;
  expiryYear: string;
  holderName: string;
  number: string;
};

export type LuupSubscriptionResponse = {
  subscription: LuppSubscription;
  subscription_id: string;
};

export type LuupPlanChangeResponse = LuupSubscriptionResponse;

export type LuupCancelSubscriptionResponse = LuupSubscriptionResponse & {
  access_until: string;
};

export type AppliedDiscount = {
  amountOff?: number | null;
  code: string;
  couponId: string;
  finalPrice: number;
  percentOff?: number | null;
};

// Billing pages match on the raw snake_case error codes (e.g. trial_expired),
// so surface payload.error verbatim instead of the humanized default.
const rawBillingErrorCode: Humanizer = (payload) =>
  typeof payload?.error === "string" ? payload.error : null;

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildTrendSkeleton(days: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    return {
      date: dateKey(date),
      label: date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      views: 0,
      productClicks: 0,
      addToCart: 0,
      shares: 0,
    };
  });
}

function applyEventCount(
  point: BillingUsageTrendPoint,
  eventType: TrackedEventType,
) {
  if (eventType === "video_view") point.views += 1;
  if (eventType === "product_click") point.productClicks += 1;
  if (eventType === "add_to_cart_click") point.addToCart += 1;
  if (eventType === "share_click") point.shares += 1;
}

export const billingService = {
  async getCurrentSubscription(
    storeId: string,
  ): Promise<LuppSubscription | null> {
    const { data, error } = await requireSupabase()
      .from("subscriptions")
      .select("*")
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

    const { data: monthlyUsage, error: monthlyUsageError } = await (
      supabase as unknown as MonthlyUsageRpcClient
    )
      .rpc("get_store_monthly_usage", { check_store_id: storeId })
      .maybeSingle();

    if (!monthlyUsageError && monthlyUsage) {
      const activeWidgets = await getActiveWidgetUsage(supabase, storeId).catch(
        () => Number(monthlyUsage.active_widgets ?? 0),
      );

      return {
        activeVideos: Number(monthlyUsage.active_videos ?? 0),
        monthViews: Number(monthlyUsage.month_views ?? 0),
        activeWidgets,
      };
    }

    const [activeVideos, monthViews, activeWidgets] = await Promise.all([
      supabase
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "active"),
      supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("event_type", "video_view")
        .gte("created_at", monthStart.toISOString()),
      supabase
        .from("widgets")
        .select("type,status,settings")
        .eq("store_id", storeId)
        .eq("status", "active"),
    ]);

    return {
      activeVideos: activeVideos.count ?? 0,
      monthViews: monthViews.count ?? 0,
      activeWidgets: countBillableWidgets(activeWidgets.data ?? []),
    };
  },

  async getUsageTrend(
    storeId: string,
    days = 30,
  ): Promise<BillingUsageTrendPoint[]> {
    const safeDays = Math.max(7, Math.min(days, 90));
    const trend = buildTrendSkeleton(safeDays);
    const trendByDate = new Map(trend.map((point) => [point.date, point]));
    const since = new Date();
    since.setDate(since.getDate() - (safeDays - 1));
    since.setHours(0, 0, 0, 0);

    const { data, error } = await requireSupabase()
      .from("analytics_events")
      .select("event_type, created_at")
      .eq("store_id", storeId)
      .in("event_type", [...TRACKED_EVENT_TYPES])
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });

    if (error) throw error;

    for (const event of data ?? []) {
      const eventType = event.event_type as TrackedEventType;
      if (!TRACKED_EVENT_TYPES.includes(eventType)) continue;
      const key = dateKey(new Date(event.created_at));
      const point = trendByDate.get(key);
      if (point) applyEventCount(point, eventType);
    }

    return trend;
  },

  async getEventSummary(storeId: string): Promise<BillingEventSummary> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data, error } = await requireSupabase()
      .from("analytics_events")
      .select("event_type")
      .eq("store_id", storeId)
      .in("event_type", [...TRACKED_EVENT_TYPES])
      .gte("created_at", monthStart.toISOString());

    if (error) throw error;

    const summary: BillingEventSummary = {
      addToCart: 0,
      productClicks: 0,
      shares: 0,
      views: 0,
    };

    for (const event of data ?? []) {
      const eventType = event.event_type as TrackedEventType;
      if (eventType === "video_view") summary.views += 1;
      if (eventType === "product_click") summary.productClicks += 1;
      if (eventType === "add_to_cart_click") summary.addToCart += 1;
      if (eventType === "share_click") summary.shares += 1;
    }

    return summary;
  },

  canCreateActiveVideo(planId: PlanId, usage: UsageSnapshot) {
    return usage.activeVideos < PLAN_LIMITS[planId].videoLimit;
  },

  isNearViewLimit(planId: PlanId, usage: UsageSnapshot) {
    return usage.monthViews >= PLAN_LIMITS[planId].viewLimit * 0.8;
  },

  getAccessStatus(
    subscription: LuppSubscription | null | undefined,
    store?: { trial_ends_at?: string | null } | null,
  ) {
    const now = Date.now();
    const status = subscription?.status || "";
    const periodEndsAt = subscription?.current_period_end || null;
    const periodEndTime = periodEndsAt ? new Date(periodEndsAt).getTime() : 0;
    const trialEndsAt =
      status === "trialing"
        ? store?.trial_ends_at || periodEndsAt || null
        : null;
    const trialEndTime = trialEndsAt ? new Date(trialEndsAt).getTime() : 0;
    const trialMsLeft = Math.max(0, trialEndTime - now);
    const isTrialing = status === "trialing" && Boolean(trialEndsAt);
    const isCanceling = status === "canceling";
    const isPaid =
      (status === "active" && (!periodEndsAt || periodEndTime > now)) ||
      (isCanceling && periodEndTime > now);
    const isTrialActive = isTrialing && trialMsLeft > 0;

    return {
      accessEndsAt: isTrialing ? trialEndsAt : periodEndsAt,
      daysLeft: Math.ceil(trialMsLeft / (24 * 60 * 60 * 1000)),
      hoursLeft: Math.ceil(trialMsLeft / (60 * 60 * 1000)),
      isActive: isPaid || isTrialActive,
      isCanceling,
      isPaid,
      isTrialExpired: isTrialing && trialMsLeft <= 0 && !isPaid,
      isTrialing,
      trialEndsAt,
    };
  },

  async validateCoupon(code: string): Promise<DiscountCoupon | null> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return null;

    const { data, error } = await requireSupabase()
      .from("discount_coupons")
      .select("*")
      .ilike("code", normalizedCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const now = Date.now();
    const startsAt = data.starts_at ? new Date(data.starts_at).getTime() : 0;
    const expiresAt = data.expires_at
      ? new Date(data.expires_at).getTime()
      : Number.POSITIVE_INFINITY;
    const hasReachedLimit =
      typeof data.max_redemptions === "number" &&
      data.redemption_count >= data.max_redemptions;

    if (startsAt > now || expiresAt < now || hasReachedLimit) return null;
    return data;
  },

  calculateDiscount(planId: PlanId, coupon: DiscountCoupon | null) {
    const price = PLAN_LIMITS[planId].priceMonthly;
    if (!coupon) return null;
    const amountOff = coupon.amount_off ?? 0;
    const percentAmount = coupon.percent_off
      ? price * (coupon.percent_off / 100)
      : 0;
    const discount = Math.min(price, amountOff || percentAmount);
    return {
      amountOff: coupon.amount_off,
      code: coupon.code,
      couponId: coupon.id,
      finalPrice: Math.max(0, price - discount),
      percentOff: coupon.percent_off,
    } satisfies AppliedDiscount;
  },

  async startLuupSubscription({
    card,
    couponCode,
    customer,
    planId,
    storeId,
  }: {
    card: LuupCheckoutCard;
    couponCode?: string;
    customer: LuupCheckoutCustomer;
    planId: PlanId;
    storeId: string;
  }): Promise<LuupSubscriptionResponse> {
    const data = await apiPost<LuupSubscriptionResponse>(
      "/api/billing/subscriptions",
      {
        card,
        coupon_code: couponCode || undefined,
        customer,
        plan_id: planId,
        store_id: storeId,
      },
      { humanize: rawBillingErrorCode },
    );

    if (!data?.subscription_id) {
      throw new Error("Não foi possível criar a assinatura.");
    }

    return data;
  },

  async changeTrialPlan({
    planId,
    storeId,
  }: {
    planId: PlanId;
    storeId: string;
  }): Promise<LuupPlanChangeResponse> {
    const data = await apiPost<LuupPlanChangeResponse>(
      "/api/billing/trial-plan",
      {
        plan_id: planId,
        store_id: storeId,
      },
      { humanize: rawBillingErrorCode },
    );

    if (!data?.subscription_id) {
      throw new Error("Não foi possível liberar o plano no trial.");
    }

    return data;
  },

  async changeSubscriptionPlan({
    planId,
    storeId,
  }: {
    planId: PlanId;
    storeId: string;
  }): Promise<LuupPlanChangeResponse> {
    const data = await apiPost<LuupPlanChangeResponse>(
      "/api/billing/change-plan",
      {
        plan_id: planId,
        store_id: storeId,
      },
      { humanize: rawBillingErrorCode },
    );

    if (!data?.subscription_id) {
      throw new Error("Não foi possível alterar o plano.");
    }

    return data;
  },

  async cancelSubscription({
    storeId,
  }: {
    storeId: string;
  }): Promise<LuupCancelSubscriptionResponse> {
    const data = await apiPost<LuupCancelSubscriptionResponse>(
      "/api/billing/cancel-subscription",
      {
        store_id: storeId,
      },
      { humanize: rawBillingErrorCode },
    );

    if (!data?.subscription_id) {
      throw new Error("Não foi possível cancelar a assinatura.");
    }

    return data;
  },
};
