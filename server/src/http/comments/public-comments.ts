import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { edgeErrorSchemas, rateLimitErrorSchema } from "@/schemas/http-errors";

const ListQuerySchema = z.object({
  video_id: z.string().min(1),
});

export const ListPublicCommentsSchema = {
  schema: {
    summary: "Approved comments of a video (public)",
    description:
      "Approved comments only, author/body projection. An unknown video " +
      "returns an empty list (no existence signal).",
    tags: ["comments"],
    operationId: "listPublicComments",
    querystring: ListQuerySchema,
    response: {
      200: z.object({
        comments: z.array(
          z.object({
            id: z.string(),
            author_name: z.string().nullable(),
            body: z.string(),
            created_at: z.date().or(z.string()),
          }),
        ),
      }),
      ...edgeErrorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function listPublicCommentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { video_id } = ListQuerySchema.parse(request.query ?? {});

  const comments = await prisma.comment.findMany({
    where: { video_id, status: "approved" },
    select: { id: true, author_name: true, body: true, created_at: true },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  return reply.status(200).send({ comments });
}

const CreateBodySchema = z.object({
  store_id: z.string().min(1),
  video_id: z.string().min(1),
  author_name: z.string().min(1).max(80),
  author_email: z.email().nullish(),
  body: z.string().min(1).max(2000),
});

export const CreatePublicCommentSchema = {
  schema: {
    summary: "Create comment (public)",
    description:
      "Storefront comment submission — lands as status pending for " +
      "moderation. The video must exist on the store, be active and have " +
      "allow_comments on, else 404.",
    tags: ["comments"],
    operationId: "createPublicComment",
    body: CreateBodySchema,
    response: {
      201: z.object({ ok: z.literal(true) }),
      ...edgeErrorSchemas,
      ...rateLimitErrorSchema,
    },
  },
};

export async function createPublicCommentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateBodySchema.parse(request.body);

  const video = await prisma.video.findFirst({
    where: {
      id: body.video_id,
      store_id: body.store_id,
      status: "active",
      allow_comments: true,
    },
    select: { id: true },
  });
  if (!video) return reply.status(404).send({ error: "video_not_found" });

  await prisma.comment.create({
    data: {
      store_id: body.store_id,
      video_id: body.video_id,
      author_name: body.author_name,
      author_email: body.author_email ?? null,
      body: body.body,
      status: "pending",
    },
  });

  return reply.status(201).send({ ok: true });
}
