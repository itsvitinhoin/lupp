import type { PLAN_LIMITS } from "@/lib/constants";
import type { TableRow } from "./database";

export type PlanId = keyof typeof PLAN_LIMITS;
export type LuppPlan = TableRow<"plans">;
export type LuppSubscription = TableRow<"subscriptions">;

export interface UsageSnapshot {
  activeVideos: number;
  monthViews: number;
  activeWidgets: number;
}
