import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { clean, requireMasterAdmin } from "./master-admin";

// Ported from supabase/functions/master-console (GET / action "snapshot").
// The original read `profiles` for owner name/email; profiles are merged into
// the users table in this server, so owners come from `users`.

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function latestByStore<T extends { created_at: Date; store_id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.store_id);
    if (!current || row.created_at.getTime() > current.created_at.getTime()) {
      map.set(row.store_id, row);
    }
  }
  return map;
}

function countByStore<T extends { store_id: string }>(
  rows: T[],
  predicate?: (row: T) => boolean,
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (predicate && !predicate(row)) continue;
    map.set(row.store_id, (map.get(row.store_id) || 0) + 1);
  }
  return map;
}

function groupByStore<T extends { store_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const current = map.get(row.store_id) || [];
    current.push(row);
    map.set(row.store_id, current);
  }
  return map;
}

function planRevenue(
  plan: { price_monthly?: unknown } | undefined,
  subscription: {
    discount_amount?: unknown;
    discount_percent?: unknown;
    status?: string | null;
  } | null,
) {
  if (!subscription || subscription.status !== "active") return 0;
  const price = asNumber(plan?.price_monthly);
  const amountOff = asNumber(subscription.discount_amount);
  const percentOff = asNumber(subscription.discount_percent);
  const discount = amountOff || price * (percentOff / 100);
  return Math.max(0, price - discount);
}

export async function getMasterConsoleSnapshot() {
  const since = monthStart();

  const [
    stores,
    users,
    plans,
    subscriptions,
    integrations,
    videos,
    products,
    widgets,
    events,
    auditLogs,
  ] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true,
        owner_id: true,
        name: true,
        slug: true,
        url: true,
        platform: true,
        status: true,
        plan_id: true,
        logo_url: true,
        trial_started_at: true,
        trial_ends_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.plan.findMany(),
    prisma.subscription.findMany({ orderBy: { created_at: "desc" } }),
    prisma.integration.findMany({
      select: {
        id: true,
        store_id: true,
        provider: true,
        status: true,
        external_store_id: true,
        connected_at: true,
        last_sync_at: true,
        settings: true,
      },
    }),
    prisma.video.findMany({
      select: { id: true, store_id: true, status: true, processing_status: true, created_at: true },
    }),
    prisma.product.findMany({ select: { id: true, store_id: true, status: true } }),
    prisma.widget.findMany({ select: { id: true, store_id: true, status: true } }),
    // Aggregated in Postgres: the events table grows without bound and
    // loading raw rows to count them in JS made this admin snapshot the
    // heaviest query in the app.
    prisma.analyticsEvent.groupBy({
      by: ["store_id", "event_type"],
      _count: { _all: true },
      where: {
        created_at: { gte: since },
        event_type: {
          in: [
            "video_view",
            "widget_view",
            "feed_open",
            "product_click",
            "add_to_cart_click",
            "share_click",
          ],
        },
      },
    }),
    prisma.masterConsoleAuditLog.findMany({
      orderBy: { created_at: "desc" },
      take: 20,
    }),
  ]);

  const ownersById = new Map(users.map((user) => [user.id, user]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const latestSubscriptionByStore = latestByStore(subscriptions);
  const integrationsByStore = groupByStore(integrations);
  const activeVideosByStore = countByStore(videos, (video) => video.status === "active");
  const processingVideosByStore = countByStore(
    videos,
    (video) => video.processing_status === "processing",
  );
  const productsByStore = countByStore(products, (product) => product.status === "active");
  const widgetsByStore = countByStore(widgets, (widget) => widget.status === "active");
  const eventCountsFor = (type: string) =>
    new Map(
      events
        .filter((row) => row.event_type === type)
        .map((row) => [row.store_id, row._count._all] as const),
    );
  const eventCounts = {
    addToCart: eventCountsFor("add_to_cart_click"),
    feedOpen: eventCountsFor("feed_open"),
    productClick: eventCountsFor("product_click"),
    share: eventCountsFor("share_click"),
    videoView: eventCountsFor("video_view"),
    widgetView: eventCountsFor("widget_view"),
  };

  const now = Date.now();
  const rows = stores.map((store) => {
    const subscription = latestSubscriptionByStore.get(store.id) || null;
    const planId = clean(subscription?.plan_id || store.plan_id || "start");
    const plan = plansById.get(planId);
    const storeIntegrations = integrationsByStore.get(store.id) || [];
    const activeIntegrations = storeIntegrations.filter(
      (integration) => integration.status === "active",
    );
    const trialEndsAt = store.trial_ends_at || subscription?.current_period_end || null;
    const trialTime = trialEndsAt ? trialEndsAt.getTime() : 0;
    const trialDaysLeft = trialTime
      ? Math.ceil(Math.max(0, trialTime - now) / 86_400_000)
      : null;
    const mrr = planRevenue(plan, subscription);
    const owner = ownersById.get(store.owner_id);

    return {
      active_integrations: activeIntegrations.map((integration) => ({
        external_store_id: integration.external_store_id,
        last_sync_at: integration.last_sync_at,
        provider: integration.provider,
        status: integration.status,
      })),
      active_videos: activeVideosByStore.get(store.id) || 0,
      active_widgets: widgetsByStore.get(store.id) || 0,
      add_to_cart_month: eventCounts.addToCart.get(store.id) || 0,
      created_at: store.created_at,
      feed_opens_month: eventCounts.feedOpen.get(store.id) || 0,
      id: store.id,
      logo_url: store.logo_url,
      mrr,
      name: store.name,
      owner_email: owner?.email || null,
      owner_name: owner?.name || null,
      plan_id: planId,
      plan_name: plan?.name || planId,
      platform: store.platform,
      processing_videos: processingVideosByStore.get(store.id) || 0,
      product_clicks_month: eventCounts.productClick.get(store.id) || 0,
      products: productsByStore.get(store.id) || 0,
      shares_month: eventCounts.share.get(store.id) || 0,
      slug: store.slug,
      status: store.status,
      subscription_id: subscription?.id || null,
      subscription_status: subscription?.status || null,
      trial_days_left: trialDaysLeft,
      trial_ends_at: trialEndsAt,
      updated_at: store.updated_at,
      url: store.url,
      video_views_month: eventCounts.videoView.get(store.id) || 0,
      widget_views_month: eventCounts.widgetView.get(store.id) || 0,
    };
  });

  const metrics = rows.reduce(
    (acc, row) => {
      acc.mrr += row.mrr;
      acc.arr = acc.mrr * 12;
      acc.activeStores += row.status === "active" ? 1 : 0;
      acc.pausedStores += row.status === "paused" ? 1 : 0;
      acc.paidStores += row.subscription_status === "active" ? 1 : 0;
      acc.trialStores += row.subscription_status === "trialing" ? 1 : 0;
      acc.trialsEndingSoon +=
        row.subscription_status === "trialing" &&
        row.trial_days_left !== null &&
        row.trial_days_left <= 3
          ? 1
          : 0;
      acc.expiredTrials +=
        row.subscription_status === "trialing" &&
        row.trial_days_left !== null &&
        row.trial_days_left <= 0
          ? 1
          : 0;
      acc.activeVideos += row.active_videos;
      acc.processingVideos += row.processing_videos;
      acc.monthViews += row.video_views_month;
      acc.monthAddToCart += row.add_to_cart_month;
      return acc;
    },
    {
      activeStores: 0,
      activeVideos: 0,
      arr: 0,
      expiredTrials: 0,
      monthAddToCart: 0,
      monthViews: 0,
      mrr: 0,
      paidStores: 0,
      pausedStores: 0,
      processingVideos: 0,
      trialStores: 0,
      trialsEndingSoon: 0,
    },
  );

  return {
    audit_logs: auditLogs,
    generated_at: new Date().toISOString(),
    metrics,
    stores: rows,
  };
}

export const MasterConsoleSnapshotResponseSchema = z.object({
  audit_logs: z.array(z.any()),
  generated_at: z.string(),
  metrics: z
    .object({
      activeStores: z.number(),
      activeVideos: z.number(),
      arr: z.number(),
      expiredTrials: z.number(),
      monthAddToCart: z.number(),
      monthViews: z.number(),
      mrr: z.number(),
      paidStores: z.number(),
      pausedStores: z.number(),
      processingVideos: z.number(),
      trialStores: z.number(),
      trialsEndingSoon: z.number(),
    })
    .loose(),
  stores: z.array(z.any()),
});

export const MasterConsoleSnapshotSchema = {
  schema: {
    summary: "Master console snapshot",
    description:
      "Cross-store operational snapshot for the master console: per-store MRR, trial state, " +
      "video/product/widget counts, current-month analytics event counts, latest subscription " +
      "and active integrations, plus aggregate metrics (MRR/ARR, trials ending soon) and the " +
      "20 most recent audit logs. Caller's email must be in the MASTER_ADMIN_EMAILS allowlist " +
      "(403 master_access_denied otherwise).",
    tags: ["master-console"],
    operationId: "getMasterConsoleSnapshot",
    security: [{ bearerAuth: [] }],
    response: {
      200: MasterConsoleSnapshotResponseSchema,
      ...edgeErrorSchemas,
    },
  },
};

export async function masterConsoleSnapshotHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireMasterAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  try {
    return reply.status(200).send(await getMasterConsoleSnapshot());
  } catch (error) {
    return reply
      .status(500)
      .send({ error: error instanceof Error ? error.message : "master_console_failed" });
  }
}
