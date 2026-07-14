import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { findStoreMembership } from "@/lib/store-membership";
import {
  imageExtensionFromFileName,
  isBunnyStorageConfigured,
  uploadToBunnyStorage,
} from "@/lib/bunny-storage";
import { edgeErrorSchemas } from "@/schemas/http-errors";

export const UploadThumbnailSchema = {
  schema: {
    summary: "Upload video thumbnail",
    description:
      "Raw image bytes (content-type image/*, headers x-store-id and " +
      "x-file-name) stored on the Bunny Storage zone at " +
      "{storeId}/thumbnails/{uuid}.{ext}. Replaces the Supabase thumbnails " +
      "bucket.",
    tags: ["videos"],
    operationId: "uploadVideoThumbnail",
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({ url: z.string(), path: z.string() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function uploadThumbnailHandler(request: FastifyRequest, reply: FastifyReply) {
  const storeId = String(request.headers["x-store-id"] ?? "").trim();
  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  if (!isBunnyStorageConfigured()) {
    return reply.status(500).send({ error: "missing_bunny_storage_config" });
  }

  const body = request.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return reply.status(400).send({ error: "missing_image_body" });
  }

  const fileName = String(request.headers["x-file-name"] ?? "");
  const extension = imageExtensionFromFileName(fileName) || "jpg";
  const path = `${storeId}/thumbnails/${randomUUID()}.${extension}`;

  try {
    const uploaded = await uploadToBunnyStorage({
      path,
      body,
      contentType: String(request.headers["content-type"] ?? "image/jpeg"),
    });
    return reply.status(200).send(uploaded);
  } catch (error) {
    request.log.error({ err: error }, "Bunny Storage thumbnail upload failed");
    return reply.status(502).send({ error: "thumbnail_upload_failed" });
  }
}
