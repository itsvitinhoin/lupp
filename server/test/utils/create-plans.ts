import { prisma } from "../../src/lib/prisma";

/**
 * Seeds the four catalog plans into the (ephemeral, per-test-file) schema.
 * Mirrors prisma/seed.ts; subscription rows FK plans.id, so specs touching
 * subscriptions with plan_id set need this first.
 */
export async function createPlans() {
  await prisma.plan.createMany({
    data: [
      { id: "start", name: "Start", price_monthly: 149, video_limit: 30, view_limit: 5_000, widget_limit: 1 },
      { id: "growth", name: "Growth", price_monthly: 199, video_limit: 80, view_limit: 20_000, widget_limit: 5 },
      { id: "pro", name: "Pro", price_monthly: 299, video_limit: 200, view_limit: 60_000, widget_limit: 999 },
      { id: "scale", name: "Scale", price_monthly: 499, video_limit: 500, view_limit: 150_000, widget_limit: 999 },
    ],
    skipDuplicates: true,
  });
}
