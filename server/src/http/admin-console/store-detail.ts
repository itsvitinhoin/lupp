import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { requireAdmin } from "./admin-gate";
import { planRevenue } from "./snapshot";

const ParamsSchema = z.object({
  storeId: z.string().min(1).describe("Store id."),
});

export const AdminConsoleStoreDetailSchema = {
  schema: {
    summary: "Admin console store detail",
    description:
      "Full operational view of one store for the admin console: the store row, owner and " +
      "members, subscriptions with plan, integrations including their settings/credentials and " +
      "the integration_secrets row (this is the admin-role-gated surface — the only " +
      "place secrets may leave the DB), widgets, feed settings, custom pages, domains, recent " +
      "videos, usage counts, 30-day analytics totals, this store's audit logs and recent " +
      "integration webhook events. Caller's account must hold the admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleStoreDetail",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z
        .object({
          store: z.any(),
          owner: z.any(),
          members: z.array(z.any()),
          plan: z.any(),
          mrr: z.number(),
          trial_days_left: z.number().nullable(),
          subscriptions: z.array(z.any()),
          integrations: z.array(z.any()),
          widgets: z.array(z.any()),
          feed_settings: z.any(),
          custom_pages: z.array(z.any()),
          store_domains: z.array(z.any()),
          counts: z
            .object({
              videos_total: z.number(),
              videos_active: z.number(),
              videos_processing: z.number(),
              products_total: z.number(),
              products_active: z.number(),
              widgets_total: z.number(),
              widgets_active: z.number(),
              custom_pages: z.number(),
              comments_pending: z.number(),
              comments_total: z.number(),
              likes_total: z.number(),
              events_30d_total: z.number(),
            })
            .loose(),
          analytics_30d: z.array(z.object({ event_type: z.string(), count: z.number() }).loose()),
          audit_logs: z.array(z.any()),
          webhook_events: z.array(z.any()),
          generated_at: z.string(),
        })
        .loose(),
      ...edgeErrorSchemas,
    },
  },
};

export async function adminConsoleStoreDetailHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const { storeId } = ParamsSchema.parse(request.params);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          email_confirmed_at: true,
          created_at: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              email_confirmed_at: true,
              created_at: true,
            },
          },
        },
        orderBy: { created_at: "asc" },
      },
      subscriptions: { include: { plan: true }, orderBy: { created_at: "desc" } },
      integrations: { include: { secret: true }, orderBy: { created_at: "asc" } },
      widgets: { orderBy: { created_at: "asc" } },
      feed_settings: true,
      custom_pages: {
        select: { id: true, name: true, slug: true, layout: true, status: true, created_at: true },
        orderBy: { created_at: "asc" },
      },
      store_domains: { orderBy: { created_at: "asc" } },
    },
  });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const integrationPairs = store.integrations
    .filter((integration) => integration.external_store_id)
    .map((integration) => ({
      provider: integration.provider,
      external_store_id: integration.external_store_id as string,
    }));

  const [
    videosTotal,
    videosActive,
    videosProcessing,
    productsTotal,
    productsActive,
    commentsPending,
    commentsTotal,
    likesTotal,
    events30dTotal,
    analytics,
    auditLogs,
    webhookEvents,
  ] = await Promise.all([
    prisma.video.count({ where: { store_id: storeId } }),
    prisma.video.count({ where: { store_id: storeId, status: "active" } }),
    prisma.video.count({ where: { store_id: storeId, processing_status: "processing" } }),
    prisma.product.count({ where: { store_id: storeId } }),
    prisma.product.count({ where: { store_id: storeId, status: "active" } }),
    prisma.comment.count({ where: { store_id: storeId, status: "pending" } }),
    prisma.comment.count({ where: { store_id: storeId } }),
    prisma.videoLike.count({ where: { store_id: storeId } }),
    prisma.analyticsEvent.count({ where: { store_id: storeId, created_at: { gte: since } } }),
    prisma.analyticsEvent.groupBy({
      by: ["event_type"],
      _count: { _all: true },
      where: { store_id: storeId, created_at: { gte: since } },
    }),
    prisma.adminConsoleAuditLog.findMany({
      where: { target_store_id: storeId },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    integrationPairs.length
      ? prisma.integrationWebhookEvent.findMany({
          where: { OR: integrationPairs },
          orderBy: { created_at: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const latestSubscription = store.subscriptions[0] || null;
  const planId = latestSubscription?.plan_id || store.plan_id || "start";
  const plan =
    latestSubscription?.plan || (await prisma.plan.findUnique({ where: { id: planId } }));
  const trialEndsAt = store.trial_ends_at || latestSubscription?.current_period_end || null;
  const trialDaysLeft = trialEndsAt
    ? Math.ceil(Math.max(0, trialEndsAt.getTime() - Date.now()) / 86_400_000)
    : null;

  const {
    subscriptions,
    integrations,
    owner,
    members,
    widgets,
    feed_settings,
    custom_pages,
    store_domains,
    ...storeRow
  } = store;

  return reply.status(200).send({
    store: storeRow,
    owner,
    members,
    plan,
    mrr: planRevenue(plan ?? undefined, latestSubscription),
    trial_days_left: trialDaysLeft,
    subscriptions,
    integrations,
    widgets,
    feed_settings,
    custom_pages,
    store_domains,
    counts: {
      videos_total: videosTotal,
      videos_active: videosActive,
      videos_processing: videosProcessing,
      products_total: productsTotal,
      products_active: productsActive,
      widgets_total: widgets.length,
      widgets_active: widgets.filter((widget) => widget.status === "active").length,
      custom_pages: custom_pages.length,
      comments_pending: commentsPending,
      comments_total: commentsTotal,
      likes_total: likesTotal,
      events_30d_total: events30dTotal,
    },
    analytics_30d: analytics.map((row) => ({
      event_type: row.event_type,
      count: row._count._all,
    })),
    audit_logs: auditLogs,
    webhook_events: webhookEvents,
    generated_at: new Date().toISOString(),
  });
}
