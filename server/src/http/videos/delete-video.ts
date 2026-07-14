import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import {
  bunnyStreamFetch,
  getBunnyStreamConfig,
  readBunnyError,
} from "@/lib/bunny";
import {
  bunnyStoragePathFromPublicUrl,
  deleteFromBunnyStorage,
} from "@/lib/bunny-storage";

// Ported from supabase/functions/bunny-delete-video. Field checks stay in the
// handler so the machine-readable error codes the SPA switches on are kept.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store the video belongs to."),
  video_id: z.string().optional().describe("videos.id to delete."),
});

export const DeleteVideoSchema = {
  schema: {
    summary: "Delete a video",
    description:
      "Ported from bunny-delete-video. Deletes the video at Bunny Stream (a Bunny 404 is " +
      "tolerated), removes its video_products links and the videos row; when the row delete " +
      "fails it falls back to marking the video status `deleted` / processing_status `archived`.",
    tags: ["videos"],
    operationId: "bunnyDeleteVideo",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ ok: z.boolean() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function deleteVideoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const videoId = (body.video_id ?? "").trim();

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!videoId) return reply.status(400).send({ error: "missing_video_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const video = await prisma.video.findFirst({
    where: { id: videoId, store_id: storeId },
    select: { id: true, provider: true, provider_video_id: true, thumbnail_url: true },
  });
  if (!video) return reply.status(404).send({ error: "video_not_found" });

  const providerVideoId = (video.provider_video_id ?? "").trim();
  if (video.provider === "bunny" && providerVideoId) {
    // Bunny Stream config is only required for bunny-hosted assets — legacy
    // rows (provider supabase etc.) must stay deletable without it.
    const { libraryId, apiKey } = getBunnyStreamConfig();
    if (!libraryId || !apiKey) {
      return reply.status(500).send({ error: "missing_bunny_stream_config" });
    }
    const response = await bunnyStreamFetch({
      apiKey,
      libraryId,
      method: "DELETE",
      path: `/videos/${providerVideoId}`,
    });
    // A video already gone at Bunny (404) must not block the local delete.
    if (!response.ok && response.status !== 404) {
      return reply.status(502).send({ error: await readBunnyError(response) });
    }
  }

  // Best-effort thumbnail cleanup — only for CDN-hosted (Bunny Storage)
  // thumbnails; legacy Supabase URLs resolve to "" and are skipped.
  const thumbnailPath = bunnyStoragePathFromPublicUrl(video.thumbnail_url);
  if (thumbnailPath) {
    try {
      await deleteFromBunnyStorage(thumbnailPath);
    } catch (error) {
      request.log.warn({ err: error }, "thumbnail cleanup failed");
    }
  }

  await prisma.videoProduct.deleteMany({ where: { video_id: videoId } });

  try {
    await prisma.video.deleteMany({ where: { id: videoId, store_id: storeId } });
  } catch {
    // Original fallback: when the hard delete fails, archive the row instead.
    try {
      await prisma.video.updateMany({
        where: { id: videoId, store_id: storeId },
        data: { processing_status: "archived", status: "deleted" },
      });
    } catch (updateError) {
      return reply.status(500).send({
        error:
          updateError instanceof Error
            ? updateError.message
            : "video_delete_failed",
      });
    }
  }

  return reply.status(200).send({ ok: true });
}
