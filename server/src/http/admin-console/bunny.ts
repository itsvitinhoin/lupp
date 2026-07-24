import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import {
  BunnyVideo,
  bunnyRequest,
  bunnyStreamFetch,
  getBunnyLibraryInfo,
  getBunnyStreamConfig,
  listBunnyVideos,
  readBunnyError,
} from "@/lib/bunny";
import { deleteVideoAndBunnyAsset } from "@/lib/video-deletion";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { requireAdmin } from "./admin-gate";

// Bunny Stream video management for the admin console: lists every video in
// the app's single shared Stream library (not scoped to one store — the
// library is shared across all stores), enriched per item with whatever
// store/product this app knows the video by, and a delete action that
// removes it from Bunny AND the local videos row + its relations in one
// step (server/src/lib/video-deletion.ts, shared with the store-scoped
// delete route so both surfaces behave identically).

const VideosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  itemsPerPage: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  store_id: z.string().optional(),
  product_id: z.string().optional(),
});

const BunnyDbProductSchema = z.object({ id: z.string(), name: z.string() });

// Fields shared by both the Bunny-driven list (below) and the DB-driven one
// used when a store/product filter is active — Bunny's own API has no
// concept of our store/product relations, so filtering by either can only
// happen against the local `videos` row, never against Bunny's list params.
const dbVideoSelect = {
  id: true,
  title: true,
  status: true,
  processing_status: true,
  provider_video_id: true,
  store: { select: { id: true, name: true, slug: true } },
  video_products: { select: { product: { select: { id: true, name: true } } } },
} as const;

type DbVideoRow = {
  id: string;
  title: string;
  status: string;
  processing_status: string;
  provider_video_id: string | null;
  store: { id: string; name: string; slug: string } | null;
  video_products: { product: { id: string; name: string } }[];
};

function bunnyThumbnailUrl(cdnHostname: string, guid: string, thumbnailFileName?: string | null) {
  if (!thumbnailFileName) return null;
  const base = cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `https://${base}/${guid}/${thumbnailFileName}`;
}

function toBunnyVideoItem({
  bunny,
  cdnHostname,
  dbVideo,
  guid,
}: {
  bunny: BunnyVideo | null;
  cdnHostname: string;
  dbVideo: DbVideoRow | null;
  guid: string;
}) {
  return {
    guid,
    title: bunny?.title ?? dbVideo?.title ?? null,
    dateUploaded: bunny?.dateUploaded ?? null,
    length: bunny?.length ?? null,
    status: bunny?.status ?? null,
    storageSize: bunny?.storageSize ?? null,
    views: bunny?.views ?? null,
    width: bunny?.width ?? null,
    height: bunny?.height ?? null,
    thumbnailUrl: bunnyThumbnailUrl(cdnHostname, guid, bunny?.thumbnailFileName),
    db: dbVideo
      ? {
          id: dbVideo.id,
          title: dbVideo.title,
          status: dbVideo.status,
          processing_status: dbVideo.processing_status,
          store: dbVideo.store,
          products: dbVideo.video_products.map((link) => link.product),
        }
      : null,
  };
}

const BunnyVideoItemSchema = z
  .object({
    guid: z.string(),
    title: z.string().nullable(),
    dateUploaded: z.string().nullable(),
    length: z.number().nullable(),
    status: z.number().nullable(),
    storageSize: z.number().nullable(),
    views: z.number().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    thumbnailUrl: z.string().nullable(),
    db: z
      .object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        processing_status: z.string(),
        store: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
        products: z.array(BunnyDbProductSchema),
      })
      .nullable(),
  })
  .loose();

export const AdminConsoleBunnyVideosSchema = {
  schema: {
    summary: "Admin console Bunny video list",
    description:
      "Paginated list straight from Bunny Stream's shared library, each item enriched with " +
      "the matching local videos row (by provider_video_id) and its store/product relations " +
      "when one exists. When store_id and/or product_id is given, pagination is driven by " +
      "the local videos table instead (Bunny has no concept of our relations), and each " +
      "matching row's Bunny metadata is fetched individually. Caller's account must hold " +
      "the admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleBunnyVideos",
    security: [{ bearerAuth: [] }],
    querystring: VideosQuerySchema,
    response: {
      200: z
        .object({
          currentPage: z.number(),
          itemsPerPage: z.number(),
          totalItems: z.number(),
          items: z.array(BunnyVideoItemSchema),
        })
        .loose(),
      ...edgeErrorSchemas,
      500: z.object({ error: z.string() }),
      502: z.object({ error: z.string() }),
    },
  },
};

export async function adminConsoleBunnyVideosHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const { libraryId, apiKey, cdnHostname } = getBunnyStreamConfig();
  if (!libraryId || !apiKey) {
    return reply.status(500).send({ error: "missing_bunny_stream_config" });
  }

  const query = VideosQuerySchema.parse(request.query ?? {});
  const page = query.page ?? 1;
  const itemsPerPage = query.itemsPerPage ?? 25;

  if (query.store_id || query.product_id) {
    return reply.status(200).send(
      await listBunnyVideosFilteredByDb({
        apiKey,
        cdnHostname,
        libraryId,
        page,
        itemsPerPage,
        productId: query.product_id,
        storeId: query.store_id,
      }),
    );
  }

  let bunnyPage;
  try {
    bunnyPage = await listBunnyVideos({
      apiKey,
      libraryId,
      page,
      itemsPerPage,
      search: query.search,
    });
  } catch (error) {
    return reply.status(502).send({
      error: error instanceof Error ? error.message : "bunny_request_failed",
    });
  }

  const guids = (bunnyPage.items ?? []).map((item) => item.guid).filter(Boolean) as string[];
  const dbVideos = guids.length
    ? await prisma.video.findMany({
        where: { provider: "bunny", provider_video_id: { in: guids } },
        select: dbVideoSelect,
      })
    : [];
  const dbVideoByGuid = new Map(dbVideos.map((video) => [video.provider_video_id, video]));

  const items = (bunnyPage.items ?? []).map((item) =>
    toBunnyVideoItem({
      bunny: item,
      cdnHostname,
      dbVideo: (item.guid ? dbVideoByGuid.get(item.guid) : undefined) ?? null,
      guid: item.guid ?? "",
    }),
  );

  return reply.status(200).send({
    currentPage: bunnyPage.currentPage ?? page,
    itemsPerPage: bunnyPage.itemsPerPage ?? itemsPerPage,
    totalItems: bunnyPage.totalItems ?? items.length,
    items,
  });
}

/**
 * Store/product filters only exist in the local `videos` table, so when
 * either is set, pagination is driven by that table instead of Bunny's own
 * list endpoint: page the matching rows, then fetch each row's Bunny
 * metadata individually (bounded by itemsPerPage, so no worse than one
 * extra round trip per row on a single page).
 */
async function listBunnyVideosFilteredByDb({
  apiKey,
  cdnHostname,
  itemsPerPage,
  libraryId,
  page,
  productId,
  storeId,
}: {
  apiKey: string;
  cdnHostname: string;
  itemsPerPage: number;
  libraryId: string;
  page: number;
  productId?: string;
  storeId?: string;
}) {
  const where = {
    provider: "bunny" as const,
    ...(storeId ? { store_id: storeId } : {}),
    ...(productId ? { video_products: { some: { product_id: productId } } } : {}),
  };

  const [totalItems, dbVideos] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      select: dbVideoSelect,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * itemsPerPage,
      take: itemsPerPage,
    }),
  ]);

  const items = await Promise.all(
    dbVideos.map(async (dbVideo) => {
      const guid = dbVideo.provider_video_id ?? "";
      const bunny = guid
        ? await bunnyRequest<BunnyVideo>({
            apiKey,
            libraryId,
            method: "GET",
            path: `/videos/${guid}`,
          }).catch(() => null)
        : null;
      return toBunnyVideoItem({ bunny, cdnHostname, dbVideo, guid });
    }),
  );

  return { currentPage: page, itemsPerPage, totalItems, items };
}

export const AdminConsoleBunnySummarySchema = {
  schema: {
    summary: "Admin console Bunny usage summary",
    description:
      "Bunny Stream library totals (video count from Bunny's own API) plus this app's local " +
      "aggregate (stored bytes, video count) for the same shared library, and the configured " +
      "library id/CDN hostname. No account-level billing data — this app only holds a " +
      "library-scoped Stream API key, not an account-level one, so exact invoices/pricing " +
      "must be checked directly in the Bunny.net dashboard. Caller's account must hold the " +
      "admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleBunnySummary",
    security: [{ bearerAuth: [] }],
    response: {
      200: z
        .object({
          library_id: z.string(),
          cdn_hostname: z.string(),
          bunny_video_count: z.number().nullable(),
          local_video_count: z.number(),
          local_storage_bytes: z.string(),
        })
        .loose(),
      ...edgeErrorSchemas,
      500: z.object({ error: z.string() }),
    },
  },
};

export async function adminConsoleBunnySummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const { libraryId, apiKey, cdnHostname } = getBunnyStreamConfig();
  if (!libraryId || !apiKey) {
    return reply.status(500).send({ error: "missing_bunny_stream_config" });
  }

  const [libraryInfo, localAggregate] = await Promise.all([
    getBunnyLibraryInfo({ apiKey, libraryId }).catch(() => null),
    prisma.video.aggregate({
      where: { provider: "bunny" },
      _count: { _all: true },
      _sum: { file_size: true },
    }),
  ]);

  return reply.status(200).send({
    library_id: libraryId,
    cdn_hostname: cdnHostname,
    bunny_video_count: libraryInfo?.videoCount ?? null,
    local_video_count: localAggregate._count._all,
    // BigInt doesn't survive JSON serialization — stringify it.
    local_storage_bytes: String(localAggregate._sum.file_size ?? 0),
  });
}

const DeleteParamsSchema = z.object({ guid: z.string().min(1) });

export const AdminConsoleBunnyDeleteVideoSchema = {
  schema: {
    summary: "Admin console delete Bunny video",
    description:
      "Deletes a video by its Bunny Stream guid: removes the Bunny asset (a 404 there is " +
      "tolerated), and if a local videos row references it (by provider_video_id), also " +
      "removes its video_products links and the row itself (same shared logic as the " +
      "store-scoped delete route). Caller's account must hold the admin role.",
    tags: ["admin-console"],
    operationId: "deleteAdminConsoleBunnyVideo",
    security: [{ bearerAuth: [] }],
    params: DeleteParamsSchema,
    response: {
      200: z.object({ ok: z.boolean() }),
      ...edgeErrorSchemas,
      500: z.object({ error: z.string() }),
      502: z.object({ error: z.string() }),
    },
  },
};

export async function adminConsoleBunnyDeleteVideoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const { guid } = DeleteParamsSchema.parse(request.params);

  const dbVideo = await prisma.video.findFirst({
    where: { provider: "bunny", provider_video_id: guid },
    select: { id: true, store_id: true, provider: true, provider_video_id: true, thumbnail_url: true },
  });

  if (dbVideo) {
    const result = await deleteVideoAndBunnyAsset(dbVideo);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    return reply.status(200).send({ ok: true });
  }

  // No local row references this asset — an orphaned Bunny video (e.g. a
  // stray test upload) — just remove it from Bunny directly.
  const { libraryId, apiKey } = getBunnyStreamConfig();
  if (!libraryId || !apiKey) {
    return reply.status(500).send({ error: "missing_bunny_stream_config" });
  }
  const response = await bunnyStreamFetch({
    apiKey,
    libraryId,
    method: "DELETE",
    path: `/videos/${guid}`,
  });
  if (!response.ok && response.status !== 404) {
    return reply.status(502).send({ error: await readBunnyError(response) });
  }
  return reply.status(200).send({ ok: true });
}

export const AdminConsoleBunnyStoresSchema = {
  schema: {
    summary: "Admin console store picker for Bunny filters",
    description:
      "Every store's id/name/slug, ordered by name — populates the Bunny page's store " +
      "filter dropdown. Caller's account must hold the admin role.",
    tags: ["admin-console"],
    operationId: "getAdminConsoleBunnyStores",
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({
        items: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function adminConsoleBunnyStoresHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const gate = await requireAdmin(request.user.sub);
  if ("error" in gate) return reply.status(gate.status).send({ error: gate.error });

  const items = await prisma.store.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return reply.status(200).send({ items });
}
