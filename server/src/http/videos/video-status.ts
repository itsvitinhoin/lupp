import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import {
  BunnyVideo,
  bunnyRequest,
  bunnyStatus,
  getBunnyStreamConfig,
  playbackUrl,
  thumbnailUrl,
} from "@/lib/bunny";

// Ported from supabase/functions/bunny-video-status. Field checks stay in the
// handler so the machine-readable error codes the SPA switches on are kept.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store the video belongs to."),
  video_id: z
    .string()
    .optional()
    .describe("videos.id to refresh from Bunny (row is updated in place)."),
  provider_video_id: z
    .string()
    .optional()
    .describe("Bunny video GUID, for uploads without a videos row yet."),
});

const StatusPayloadSchema = z.object({
  duration_seconds: z.number().nullable(),
  file_size: z.number().nullable(),
  playback_url: z.string(),
  processing_status: z.string(),
  provider_video_id: z.string(),
  thumbnail_url: z.string(),
  video_url: z.string(),
});

export const VideoStatusSchema = {
  schema: {
    summary: "Refresh Bunny encode status",
    description:
      "Ported from bunny-video-status. Fetches the video from Bunny Stream and, when a " +
      "videos row is referenced via `video_id`, updates its playback/thumbnail URLs, " +
      "duration, size and processing_status (Bunny status 4/8 = ready, 5/6 = failed).",
    tags: ["videos"],
    operationId: "bunnyVideoStatus",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: StatusPayloadSchema,
      ...edgeErrorSchemas,
    },
  },
};

export async function videoStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { libraryId, apiKey, cdnHostname } = getBunnyStreamConfig();
  if (!libraryId || !apiKey || !cdnHostname) {
    return reply.status(500).send({ error: "missing_bunny_stream_config" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const videoId = (body.video_id ?? "").trim();
  const providerVideoId = (body.provider_video_id ?? "").trim();

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (!videoId && !providerVideoId) {
    return reply.status(400).send({ error: "missing_video_id" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  let resolvedProviderVideoId = providerVideoId;
  let databaseVideoId = videoId;
  if (videoId) {
    const video = await prisma.video.findFirst({
      where: { id: videoId, store_id: storeId },
      select: { id: true, provider_video_id: true },
    });
    if (!video) return reply.status(404).send({ error: "video_not_found" });
    databaseVideoId = video.id;
    resolvedProviderVideoId = (video.provider_video_id ?? "").trim();
  }

  if (!resolvedProviderVideoId) {
    return reply.status(400).send({ error: "missing_provider_video_id" });
  }

  try {
    const video = await bunnyRequest<BunnyVideo>({
      apiKey,
      libraryId,
      method: "GET",
      path: `/videos/${resolvedProviderVideoId}`,
    });
    const processingStatus = bunnyStatus(video.status);
    const finalPlaybackUrl = playbackUrl(cdnHostname, resolvedProviderVideoId);
    const payload = {
      duration_seconds: video.length || null,
      file_size: video.storageSize || null,
      playback_url: finalPlaybackUrl,
      processing_status: processingStatus,
      provider_video_id: resolvedProviderVideoId,
      thumbnail_url: thumbnailUrl(cdnHostname, resolvedProviderVideoId),
      video_url: finalPlaybackUrl,
    };

    if (databaseVideoId) {
      await prisma.video.updateMany({
        where: { id: databaseVideoId, store_id: storeId },
        data: {
          ...payload,
          // videos.file_size is BigInt in the schema.
          file_size:
            payload.file_size === null ? null : BigInt(payload.file_size),
        },
      });
    }

    return reply.status(200).send(payload);
  } catch (error) {
    return reply.status(502).send({
      error: error instanceof Error ? error.message : "bunny_status_failed",
    });
  }
}
