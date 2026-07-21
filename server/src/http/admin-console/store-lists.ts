import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { requireAdmin } from "./admin-gate";

// Cursor-paginated per-store catalog lists (products / videos / comments)
// for the admin console tabs. All share the same contract: newest first,
// id-cursor (uuid v7 ids are time-ordered), optional case-insensitive
// search, response { items, next_cursor }.

const ParamsSchema = z.object({
  storeId: z.string().min(1).describe("Store id."),
});

const ListQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Id of the last item from the previous page."),
  limit: z.coerce.number().optional().describe("Page size (default 20, max 50)."),
  search: z.string().optional().describe("Case-insensitive filter."),
});

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function listSchema(summary: string, description: string, operationId: string) {
  return {
    schema: {
      summary,
      description: `${description} Caller's account must hold the admin role.`,
      tags: ["admin-console"],
      operationId,
      security: [{ bearerAuth: [] }],
      params: ParamsSchema,
      querystring: ListQuerySchema,
      response: {
        200: z
          .object({
            items: z.array(z.any()),
            next_cursor: z.string().nullable(),
          })
          .loose(),
        ...edgeErrorSchemas,
      },
    },
  };
}

type ListContext = {
  cursor?: string;
  limit: number;
  search: string;
  storeId: string;
};

/** Gate + store existence + normalized paging inputs, or a sent error reply. */
async function prepareList(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ListContext | null> {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) {
    await reply.status(gate.status).send({ error: gate.error });
    return null;
  }

  const { storeId } = ParamsSchema.parse(request.params);
  const query = ListQuerySchema.parse(request.query ?? {});

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });
  if (!store) {
    await reply.status(404).send({ error: "store_not_found" });
    return null;
  }

  return {
    cursor: query.cursor,
    limit: Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT)),
    search: (query.search ?? "").trim(),
    storeId,
  };
}

function cursorArgs(context: ListContext) {
  return {
    orderBy: { id: "desc" as const },
    take: context.limit + 1,
    ...(context.cursor ? { cursor: { id: context.cursor }, skip: 1 } : {}),
  };
}

function pageOf<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return {
    items,
    next_cursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}

const insensitive = (value: string) => ({
  contains: value,
  mode: "insensitive" as const,
});

export const AdminConsoleStoreProductsSchema = listSchema(
  "Admin console store products",
  "Cursor-paginated products of one store, searchable by name or external id.",
  "getAdminConsoleStoreProducts",
);

export async function adminConsoleStoreProductsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const context = await prepareList(request, reply);
  if (!context) return;

  const rows = await prisma.product.findMany({
    where: {
      store_id: context.storeId,
      ...(context.search
        ? {
            OR: [
              { name: insensitive(context.search) },
              { external_id: insensitive(context.search) },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      platform: true,
      external_id: true,
      price: true,
      compare_at_price: true,
      currency: true,
      image_url: true,
      product_url: true,
      created_at: true,
      updated_at: true,
      _count: { select: { variants: true, video_products: true } },
    },
    ...cursorArgs(context),
  });

  return reply.status(200).send(pageOf(rows, context.limit));
}

export const AdminConsoleStoreVideosSchema = listSchema(
  "Admin console store videos",
  "Cursor-paginated videos of one store, searchable by title or description.",
  "getAdminConsoleStoreVideos",
);

export async function adminConsoleStoreVideosHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const context = await prepareList(request, reply);
  if (!context) return;

  const rows = await prisma.video.findMany({
    where: {
      store_id: context.storeId,
      ...(context.search
        ? {
            OR: [
              { title: insensitive(context.search) },
              { description: insensitive(context.search) },
            ],
          }
        : {}),
    },
    // file_size (BigInt) stays out: it does not survive JSON serialization.
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      processing_status: true,
      provider: true,
      provider_video_id: true,
      video_url: true,
      playback_url: true,
      thumbnail_url: true,
      duration_seconds: true,
      aspect_ratio: true,
      cta_label: true,
      is_feed_enabled: true,
      is_product_page_enabled: true,
      is_featured: true,
      allow_likes: true,
      allow_comments: true,
      allow_sharing: true,
      created_at: true,
      updated_at: true,
      _count: { select: { video_products: true, comments: true, likes: true } },
    },
    ...cursorArgs(context),
  });

  return reply.status(200).send(pageOf(rows, context.limit));
}

export const AdminConsoleStoreCommentsSchema = listSchema(
  "Admin console store comments",
  "Cursor-paginated comments of one store, searchable by body or author.",
  "getAdminConsoleStoreComments",
);

export async function adminConsoleStoreCommentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const context = await prepareList(request, reply);
  if (!context) return;

  const rows = await prisma.comment.findMany({
    where: {
      store_id: context.storeId,
      ...(context.search
        ? {
            OR: [
              { body: insensitive(context.search) },
              { author_name: insensitive(context.search) },
              { author_email: insensitive(context.search) },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      body: true,
      status: true,
      author_name: true,
      author_email: true,
      created_at: true,
      updated_at: true,
      video: { select: { id: true, title: true } },
    },
    ...cursorArgs(context),
  });

  return reply.status(200).send(pageOf(rows, context.limit));
}
