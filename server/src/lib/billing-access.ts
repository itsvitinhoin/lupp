import { prisma } from "@/lib/prisma";

const TRIAL_FALLBACK_DAYS = 7;
const BILLING_OK_STATUSES = ["active", "trialing", "canceling"];

/**
 * App-side port of the Postgres function public.store_has_billing_access:
 * the store must be active AND either still in trial
 * (coalesce(trial_ends_at, created_at + 7 days) > now()) or have a
 * non-expired subscription in active/trialing/canceling.
 */
export async function storeHasBillingAccess(storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { status: true, created_at: true, trial_ends_at: true },
  });

  if (!store || store.status !== "active") return false;

  const now = new Date();
  const trialEnd =
    store.trial_ends_at ??
    new Date(store.created_at.getTime() + TRIAL_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  if (trialEnd > now) return true;

  const subscription = await prisma.subscription.findFirst({
    where: {
      store_id: storeId,
      status: { in: BILLING_OK_STATUSES },
      OR: [{ current_period_end: null }, { current_period_end: { gt: now } }],
    },
    select: { id: true },
  });

  return subscription !== null;
}

/**
 * App-side port of public.get_store_monthly_usage.
 */
export async function getStoreMonthlyUsage(storeId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [active_videos, month_views, active_widgets] = await Promise.all([
    prisma.video.count({ where: { store_id: storeId, status: "active" } }),
    prisma.analyticsEvent.count({
      where: {
        store_id: storeId,
        event_type: "video_view",
        created_at: { gte: monthStart },
      },
    }),
    prisma.widget.count({ where: { store_id: storeId, status: "active" } }),
  ]);

  return { active_videos, month_views, active_widgets };
}
