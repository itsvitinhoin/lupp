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

const ParamsSchema = z.object({ storeId: z.string().min(1) });

export const UploadLogoSchema = {
  schema: {
    summary: "Upload store logo",
    description:
      "Raw image bytes (content-type image/*, file name in x-file-name) " +
      "stored on the Bunny Storage zone at {storeId}/logos/{uuid}.{ext}. " +
      "Returns the public CDN URL; the client persists it via PATCH " +
      "/api/stores/:storeId. 500 missing_bunny_storage_config when the zone " +
      "is not configured.",
    tags: ["stores"],
    operationId: "uploadStoreLogo",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ url: z.string(), path: z.string() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function uploadLogoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { storeId } = ParamsSchema.parse(request.params);

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
  const extension = imageExtensionFromFileName(fileName) || "png";
  const path = `${storeId}/logos/${randomUUID()}.${extension}`;

  try {
    const uploaded = await uploadToBunnyStorage({
      path,
      body,
      contentType: String(request.headers["content-type"] ?? "image/png"),
    });
    return reply.status(200).send(uploaded);
  } catch (error) {
    request.log.error({ err: error }, "Bunny Storage logo upload failed");
    return reply.status(502).send({ error: "logo_upload_failed" });
  }
}
