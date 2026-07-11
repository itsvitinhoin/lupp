import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { AnalyticsEventType, Prisma } from "../../../generated/prisma/client";
import { clean } from "./resolve-store";

// Ported from supabase/functions/lupp-widget-bootstrap (POST). Public route:
// the storefront widget fires analytics beacons with no auth. Field checks
// stay in the handler so the machine-readable codes are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Lupp store id (required)."),
  event_type: z
    .string()
    .optional()
    .describe(`Event type (required): ${Object.keys(AnalyticsEventType).join(", ")}.`),
  metadata: z.any().optional().describe("Free-form event metadata object."),
  product_id: z.string().nullable().optional(),
  video_id: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  visitor_id: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
});

export const TrackWidgetEventSchema = {
  schema: {
    summary: "Track widget event",
    description:
      "Public analytics ingestion for the storefront widget. Requires store_id and a valid " +
      "event_type; any insert failure (unknown event type, unknown store/video/product) " +
      "returns 500 {error: analytics_insert_failed} like the original edge function.",
    tags: ["widget"],
    operationId: "trackWidgetEvent",
    body: BodySchema,
    response: {
      200: z.object({ ok: z.boolean() }),
      ...edgeErrorSchemas,
    },
  },
};

function isAnalyticsEventType(value: string): value is AnalyticsEventType {
  return value in AnalyticsEventType;
}

export async function trackWidgetEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = clean(body.store_id);
  const eventType = clean(body.event_type);

  if (!storeId || !eventType) {
    return reply.status(400).send({ error: "missing_event_data" });
  }

  try {
    // Supabase enforced the allowed event types with a CHECK constraint; the
    // Prisma enum is the same set, and a bad value fails like any other
    // insert error did in the original (500 analytics_insert_failed).
    if (!isAnalyticsEventType(eventType)) {
      throw new Error(`invalid event_type: ${eventType}`);
    }

    await prisma.analyticsEvent.create({
      data: {
        event_type: eventType,
        metadata: (body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : {}) as Prisma.InputJsonValue,
        product_id: body.product_id || null,
        referrer: body.referrer || null,
        session_id: body.session_id || null,
        store_id: storeId,
        url: body.url || null,
        user_agent: body.user_agent || null,
        video_id: body.video_id || null,
        visitor_id: body.visitor_id || null,
      },
    });
  } catch (error) {
    request.log.warn(error, "widget analytics insert failed");
    return reply.status(500).send({ error: "analytics_insert_failed" });
  }

  return reply.status(200).send({ ok: true });
}
