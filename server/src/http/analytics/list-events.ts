import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
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
    .enum(["full", "trend", "feedbacks"])
    .default("full")
    .describe(
      "Projection preset: full (dashboard), trend (event_type+created_at), " +
        "feedbacks (adds the video title join).",
    ),
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
      200: z.object({ events: z.array(AnalyticsEventRowSchema) }),
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
