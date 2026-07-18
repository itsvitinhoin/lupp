import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma, dbSchema } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { AnalyticsEventRowSchema } from "@/schemas/rows";
import { AnalyticsEventType, Prisma } from "../../../generated/prisma/client";

const MAX_WINDOW_DAYS = 92;
const MAX_LIMIT = 100_000;

const QuerySchema = z.object({
  store_id: z.string().min(1),
  since: z.iso.datetime().describe("Window start (capped at 92 days back)."),
  until: z.iso.datetime().optional(),
  event_types: z
    .string()
    .optional()
    .describe("Comma-separated AnalyticsEventType filter."),
  fields: z
    .enum(["full", "trend", "feedbacks", "daily_counts"])
    .default("full")
    .describe(
      "Projection preset: full (dashboard), trend (event_type+created_at), " +
        "feedbacks (adds the video title join), daily_counts (SQL-aggregated " +
        "per-day/per-type counts — preferred over trend for charts/summaries).",
    ),
  tz: z
    .string()
    .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/)
    .optional()
    .describe("daily_counts: IANA timezone for day bucketing (default UTC)."),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
});

export const ListAnalyticsEventsSchema = {
  schema: {
    summary: "Raw analytics events",
    description:
      "Filtered raw event rows for the dashboard, usage trend, event summary " +
      "and feedbacks screens — aggregation stays client-side, mirroring the " +
      "former direct table reads.",
    tags: ["analytics"],
    operationId: "listAnalyticsEvents",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.union([
        z.object({ events: z.array(AnalyticsEventRowSchema) }),
        z.object({
          buckets: z.array(
            z.object({ day: z.string(), event_type: z.string(), count: z.number() }),
          ),
        }),
      ]),
      ...edgeErrorSchemas,
    },
  },
};

function isEventType(value: string): value is AnalyticsEventType {
  return value in AnalyticsEventType;
}

export async function listAnalyticsEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, query.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const windowFloor = new Date(Date.now() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const since = new Date(query.since);
  const effectiveSince = since > windowFloor ? since : windowFloor;

  const eventTypes = (query.event_types ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isEventType);

  const where: Prisma.AnalyticsEventWhereInput = {
    store_id: query.store_id,
    created_at: {
      gte: effectiveSince,
      ...(query.until ? { lte: new Date(query.until) } : {}),
    },
    ...(eventTypes.length ? { event_type: { in: eventTypes } } : {}),
  };

  if (query.fields === "daily_counts") {
    // Postgres does the bucketing: ≤ window-days × event-types rows come back
    // instead of every raw event (the trend preset shipped up to 100k rows
    // for the client to count). The timezone is a bound parameter, so the
    // client's local day boundaries are preserved.
    const timezone = query.tz ?? "UTC";
    const rows = await prisma.$queryRaw<
      { day: string; event_type: string; count: number }[]
    >`
      SELECT
        to_char(created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
        event_type::text AS event_type,
        count(*)::int AS count
      FROM ${Prisma.raw(`"${dbSchema.replace(/"/g, "")}".analytics_events`)}
      WHERE store_id = ${query.store_id}
        AND created_at >= ${effectiveSince}
        ${query.until ? Prisma.sql`AND created_at <= ${new Date(query.until)}` : Prisma.empty}
        ${
          eventTypes.length
            ? Prisma.sql`AND event_type::text IN (${Prisma.join(eventTypes)})`
            : Prisma.empty
        }
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;
    return reply.status(200).send({ buckets: rows });
  }

  if (query.fields === "trend") {
    const events = await prisma.analyticsEvent.findMany({
      where,
      select: { event_type: true, created_at: true },
      orderBy: { created_at: "asc" },
      take: query.limit ?? MAX_LIMIT,
    });
    return reply.status(200).send({ events });
  }

  if (query.fields === "feedbacks") {
    const events = await prisma.analyticsEvent.findMany({
      where,
      select: {
        id: true,
        video_id: true,
        metadata: true,
        created_at: true,
        video: { select: { title: true } },
      },
      orderBy: { created_at: "desc" },
      take: query.limit ?? MAX_LIMIT,
    });
    return reply.status(200).send({
      events: events.map(({ video, ...event }) => ({
        ...event,
        videos: video ? { title: video.title } : null,
      })),
    });
  }

  const events = await prisma.analyticsEvent.findMany({
    where,
    select: {
      created_at: true,
      event_type: true,
      metadata: true,
      product_id: true,
      session_id: true,
      video_id: true,
      visitor_id: true,
    },
    orderBy: { created_at: "asc" },
    take: query.limit ?? MAX_LIMIT,
  });
  return reply.status(200).send({ events });
}
