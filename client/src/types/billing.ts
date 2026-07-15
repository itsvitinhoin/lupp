import type { PLAN_LIMITS } from "@/lib/constants";
import type { TableRow } from "./database";

export type PlanId = keyof typeof PLAN_LIMITS;
export type LuppPlan = TableRow<"plans">;
export type LuppSubscription = TableRow<"subscriptions">;
export type DiscountCoupon = TableRow<"discount_coupons">;

export interface UsageSnapshot {
  activeVideos: number;
  monthViews: number;
  activeWidgets: number;
}

export interface BillingUsageTrendPoint {
  date: string;
  label: string;
  views: number;
  productClicks: number;
  addToCart: number;
  shares: number;
}

export interface BillingEventSummary {
  views: number;
  productClicks: number;
  addToCart: number;
  shares: number;
}

export interface BillingAccessStatus {
  accessEndsAt: string | null;
  daysLeft: number;
  hoursLeft: number;
  isActive: boolean;
  isCanceling: boolean;
  isPaid: boolean;
  isTrialExpired: boolean;
  isTrialing: boolean;
  trialEndsAt: string | null;
}
