import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";

// visitor_id is required even though the column is nullable: Postgres treats
// NULLs as distinct under the (video_id, visitor_id) unique, which would let
// anonymous rows multiply. The storefront always sends its visitor id.
const BodySchema = z.object({
  store_id: z.string().min(1),
  video_id: z.string().min(1),
  visitor_id: z.string().min(8).max(64),
});

export const LikeVideoSchema = {
  schema: {
    summary: "Like a video (public)",
    description:
      "Storefront like beacon. Idempotent per (video, visitor) — duplicates " +
      "are silently ignored, mirroring the Supabase upsert with " +
      "ignoreDuplicates.",
    tags: ["widget"],
    operationId: "likeVideo",
    body: BodySchema,
    response: {
      200: z.object({ ok: z.literal(true) }),
      ...edgeErrorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function likeVideoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);

  const video = await prisma.video.findFirst({
    where: { id: body.video_id, store_id: body.store_id },
    select: { id: true },
  });
  if (!video) return reply.status(404).send({ error: "video_not_found" });

  await prisma.videoLike.createMany({
    data: [{ store_id: body.store_id, video_id: body.video_id, visitor_id: body.visitor_id }],
    skipDuplicates: true,
  });

  return reply.status(200).send({ ok: true });
}
