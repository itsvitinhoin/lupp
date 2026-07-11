/**
 * Plan catalog constants used by billing and upload-limit checks — same
 * values the Supabase edge functions hardcoded (asaas-create-subscription,
 * bunny-upload-video). The plans table (seeded via prisma/seed.ts) is the
 * customer-facing catalog; these are the enforcement-side constants.
 */
export const PLANS = {
  start: { name: "Start", priceMonthly: 149 },
  growth: { name: "Growth", priceMonthly: 199 },
  pro: { name: "Pro", priceMonthly: 299 },
  scale: { name: "Scale", priceMonthly: 499 },
} as const;

export type PlanId = keyof typeof PLANS;

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

// Upload ceiling per plan (bunny-upload-video); intentionally more generous
// than the marketing-facing plans.video_limit.
export const PLAN_VIDEO_LIMITS: Record<PlanId, number> = {
  start: 100,
  growth: 300,
  pro: 1000,
  scale: 5000,
};
