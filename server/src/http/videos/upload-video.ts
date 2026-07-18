import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { PLAN_VIDEO_LIMITS } from "@/lib/plans";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { clean } from "@/lib/text";
import {
  BUNNY_TUS_ENDPOINT,
  BunnyVideo,
  bunnyRequest,
  bunnyStatus,
  getBunnyStreamConfig,
  playbackUrl,
  thumbnailUrl,
  tusUploadSignature,
} from "@/lib/bunny";

// Ported from supabase/functions/bunny-upload-video. Two request modes share
// this route, so the body is not zod-validated (a strict schema would break
// the machine-readable error codes and reject the raw-binary mode):
// - JSON (action = create | metadata | delete): create returns presigned TUS
//   upload credentials for a browser-direct upload.
// - Raw bytes (application/octet-stream or video/*): the server creates the
//   Bunny video and forwards the buffered bytes itself.
const acceptedContentTypes = new Set([
  "application/octet-stream",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const HeadersSchema = z.object({
  "x-store-id": z.string().optional().describe("Store the upload belongs to."),
  "x-file-name": z
    .string()
    .optional()
    .describe("Original file name (URI-encoded)."),
  "x-video-title": z.string().optional().describe("Video title (URI-encoded)."),
  "x-file-size": z
    .string()
    .optional()
    .describe("File size in bytes when content-length is unavailable."),
});

export const UploadVideoSchema = {
  schema: {
    summary: "Bunny Stream upload broker",
    description:
      "Ported from bunny-upload-video. JSON mode drives the browser-direct TUS flow " +
      "(`action` = `create` returns presigned upload credentials, `metadata` fetches the " +
      "encode state, `delete` removes the Bunny video). Sending raw bytes " +
      "(application/octet-stream or video/*) uploads them through the server instead. " +
      "Enforces the per-plan video-count limit (402 `plan_video_limit_reached`).",
    tags: ["videos"],
    operationId: "bunnyUploadVideo",
    security: [{ bearerAuth: [] }],
    headers: HeadersSchema,
    response: {
      200: z
        .object({})
        .loose()
        .describe(
          "Mode-dependent: TUS credentials (create), video metadata (metadata/raw upload) or `{ ok: true }` (delete).",
        ),
      ...edgeErrorSchemas,
    },
  },
};

function cleanHeader(value: unknown) {
  const text = clean(value);
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function uploadMetadata(
  video: BunnyVideo,
  cdnHostname: string,
  videoId: string,
  fallbackFileSize = 0,
) {
  const finalPlaybackUrl = playbackUrl(cdnHostname, videoId);

  return {
    duration_seconds: video.length || null,
    file_size: video.storageSize || fallbackFileSize || null,
    path: videoId,
    playback_url: finalPlaybackUrl,
    processing_status: bunnyStatus(video.status),
    provider: "bunny",
    provider_video_id: videoId,
    status: bunnyStatus(video.status),
    thumbnail_url: thumbnailUrl(cdnHostname, videoId),
    url: finalPlaybackUrl,
    video_url: finalPlaybackUrl,
  };
}

export async function uploadVideoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { libraryId, apiKey, cdnHostname } = getBunnyStreamConfig();
  if (!libraryId || !apiKey || !cdnHostname) {
    return reply.status(500).send({ error: "missing_bunny_stream_config" });
  }

  const storeId = clean(request.headers["x-store-id"]);
  const fileName = cleanHeader(request.headers["x-file-name"]) || "video";
  const title = cleanHeader(request.headers["x-video-title"]) || fileName;
  const contentType = clean(request.headers["content-type"]).split(";")[0];
  const fileSize = Number(
    request.headers["content-length"] || request.headers["x-file-size"] || 0,
  );

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });
  if (request.body === undefined || request.body === null) {
    return reply.status(400).send({ error: "missing_video_body" });
  }

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, plan_id: true },
  });
  if (!store) return reply.status(404).send({ error: "store_not_found" });

  const planId = clean(store.plan_id) || "start";
  const videoLimit =
    (PLAN_VIDEO_LIMITS as Record<string, number>)[planId] ??
    PLAN_VIDEO_LIMITS.start;
  const videoCount = await prisma.video.count({
    where: {
      store_id: storeId,
      status: { in: ["active", "draft", "paused"] },
    },
  });
  if (videoCount >= videoLimit) {
    return reply.status(402).send({ error: "plan_video_limit_reached" });
  }

  if (contentType === "application/json") {
    const payload =
      typeof request.body === "object" && !Buffer.isBuffer(request.body)
        ? (request.body as Record<string, unknown>)
        : null;
    const action = clean(payload?.action);

    try {
      if (action === "create") {
        const uploadFileName = clean(payload?.file_name) || fileName;
        const uploadTitle =
          clean(payload?.title) ||
          uploadFileName.replace(/\.[^.]+$/, "") ||
          title;
        const uploadContentType = clean(payload?.file_type);
        const uploadFileSize = Number(payload?.file_size || 0);

        if (!acceptedContentTypes.has(uploadContentType)) {
          return reply
            .status(400)
            .send({ error: "invalid_video_content_type" });
        }

        if (!Number.isFinite(uploadFileSize) || uploadFileSize <= 0) {
          return reply.status(400).send({ error: "missing_file_size" });
        }

        const created = await bunnyRequest<BunnyVideo>({
          apiKey,
          body: JSON.stringify({ thumbnailTime: 1000, title: uploadTitle }),
          libraryId,
          method: "POST",
          path: "/videos",
        });
        const videoId = clean(created.guid);
        if (!videoId) {
          return reply.status(502).send({ error: "missing_bunny_video_id" });
        }

        const authorizationExpire = Math.floor(Date.now() / 1000) + 60 * 60 * 4;
        const authorizationSignature = tusUploadSignature({
          apiKey,
          expire: authorizationExpire,
          libraryId,
          videoId,
        });

        return reply.status(200).send({
          authorization_expire: authorizationExpire,
          authorization_signature: authorizationSignature,
          cdn_hostname: cdnHostname,
          library_id: libraryId,
          path: videoId,
          playback_url: playbackUrl(cdnHostname, videoId),
          provider: "bunny",
          provider_video_id: videoId,
          thumbnail_url: thumbnailUrl(cdnHostname, videoId),
          tus_endpoint: BUNNY_TUS_ENDPOINT,
          url: playbackUrl(cdnHostname, videoId),
        });
      }

      if (action === "metadata") {
        const videoId = clean(payload?.provider_video_id || payload?.path);
        if (!videoId) {
          return reply.status(400).send({ error: "missing_bunny_video_id" });
        }

        const video = await bunnyRequest<BunnyVideo>({
          apiKey,
          libraryId,
          method: "GET",
          path: `/videos/${videoId}`,
        });

        return reply
          .status(200)
          .send(
            uploadMetadata(
              video,
              cdnHostname,
              videoId,
              Number(payload?.file_size || 0),
            ),
          );
      }

      if (action === "delete") {
        const videoId = clean(payload?.provider_video_id || payload?.path);
        if (!videoId) {
          return reply.status(400).send({ error: "missing_bunny_video_id" });
        }

        await bunnyRequest<Record<string, unknown>>({
          apiKey,
          libraryId,
          method: "DELETE",
          path: `/videos/${videoId}`,
        });

        return reply.status(200).send({ ok: true });
      }
    } catch (error) {
      return reply.status(502).send({
        error: error instanceof Error ? error.message : "bunny_upload_failed",
      });
    }

    return reply.status(400).send({ error: "invalid_bunny_upload_action" });
  }

  if (!acceptedContentTypes.has(contentType)) {
    return reply.status(400).send({ error: "invalid_video_content_type" });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return reply.status(400).send({ error: "missing_file_size" });
  }

  let videoId = "";
  try {
    const created = await bunnyRequest<BunnyVideo>({
      apiKey,
      body: JSON.stringify({ thumbnailTime: 1000, title }),
      libraryId,
      method: "POST",
      path: "/videos",
    });
    videoId = clean(created.guid);
    if (!videoId) {
      return reply.status(502).send({ error: "missing_bunny_video_id" });
    }

    await bunnyRequest<Record<string, unknown>>({
      apiKey,
      // Buffer is a valid undici body at runtime; TS's BodyInit doesn't know.
      body: request.body as unknown as BodyInit,
      contentType: "application/octet-stream",
      libraryId,
      method: "PUT",
      path: `/videos/${videoId}`,
    });

    const video = await bunnyRequest<BunnyVideo>({
      apiKey,
      libraryId,
      method: "GET",
      path: `/videos/${videoId}`,
    });

    return reply
      .status(200)
      .send(uploadMetadata(video, cdnHostname, videoId, fileSize));
  } catch (error) {
    // Best-effort cleanup of the half-created Bunny video, like the original.
    if (videoId) {
      await bunnyRequest<Record<string, unknown>>({
        apiKey,
        libraryId,
        method: "DELETE",
        path: `/videos/${videoId}`,
      }).catch(() => null);
    }

    return reply.status(502).send({
      error: error instanceof Error ? error.message : "bunny_upload_failed",
    });
  }
}
