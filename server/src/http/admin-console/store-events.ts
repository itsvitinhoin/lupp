import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { requireAdmin } from "./admin-gate";

const ParamsSchema = z.object({
  storeId: z.string().min(1).describe("Store id."),
});

const EVENT_WINDOWS = [30, 60, 90] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Mirrors the AnalyticsEventType enum; used to validate the types filter.
const EVENT_TYPES = [
  "video_view",
  "video_progress",
  "video_complete",
  "product_click",
  "add_to_cart_click",
  "share_click",
  "like_click",
  "comment_create",
  "widget_view",
  "feed_open",
  "launcher_impression",
  "feed_close",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const QuerySchema = z.object({
  days: z.coerce
    .number()
    .optional()
    .describe("Window (in days): 30 (default), 60 or 90."),
  cursor: z
    .string()
    .optional()
    .describe("Id of the last event from the previous page."),
  limit: z.coerce.number().optional().describe("Page size (default 20, max 50)."),
  types: z
    .string()
    .optional()
    .describe("Comma-separated event types to include (all when omitted)."),
  search: z
    .string()
    .optional()
    .describe("Case-insensitive substring match on the event URL (path + query string)."),
});

export const AdminConsoleStoreEventsSchema = {
  schema: {
    summary: "Admin console store events",
    description:
      "Cursor-paginated analytics events for one store, newest first, filtered to a " +
      "30/60/90-day window, optionally narrowed to specific event types and to URLs " +
      "containing a search term (matches paths and query parameters). Pass the returned " +
      "next_cursor to fetch the following page (null when exhausted). Caller's account " +
      "must hold the admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleStoreEvents",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    querystring: QuerySchema,
    response: {
      200: z
        .object({
          events: z.array(z.any()),
          next_cursor: z.string().nullable(),
          window_days: z.number(),
        })
        .loose(),
      ...edgeErrorSchemas,
    },
  },
};

export async function adminConsoleStoreEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const { storeId } = ParamsSchema.parse(request.params);
  const query = QuerySchema.parse(request.query ?? {});
  const days = (EVENT_WINDOWS as readonly number[]).includes(query.days ?? 30)
    ? (query.days ?? 30)
    : 30;
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const types = (query.types ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter((type): type is EventType =>
      (EVENT_TYPES as readonly string[]).includes(type),
    );
  const search = (query.search ?? "").trim();

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  // uuid(7) ids are time-ordered, so id desc matches created_at desc while
  // giving the cursor a unique column. One extra row detects a next page.
  const rows = await prisma.analyticsEvent.findMany({
    where: {
      store_id: storeId,
      created_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      ...(types.length ? { event_type: { in: types } } : {}),
      ...(search ? { url: { contains: search, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true,
      event_type: true,
      url: true,
      created_at: true,
      video: { select: { id: true, title: true } },
      product: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const events = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? events[events.length - 1].id : null;

  return reply.status(200).send({
    events,
    next_cursor: nextCursor,
    window_days: days,
  });
}
