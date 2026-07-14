import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { CommentRowSchema } from "@/schemas/rows";

const QuerySchema = z.object({
  store_id: z.string().min(1),
  status: z.enum(["pending", "approved", "hidden", "reported"]).optional(),
});

export const ListCommentsSchema = {
  schema: {
    summary: "List comments (moderation)",
    description:
      "Comments of a store (deleted excluded), newest first, with the video " +
      "title and linked product names in the Supabase join shape " +
      "(videos.video_products[].products.name).",
    tags: ["comments"],
    operationId: "listComments",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ comments: z.array(CommentRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listCommentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, query.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const comments = await prisma.comment.findMany({
    where: {
      store_id: query.store_id,
      status: query.status ?? { not: "deleted" },
    },
    orderBy: { created_at: "desc" },
    include: {
      video: {
        select: {
          title: true,
          video_products: { select: { product: { select: { name: true } } } },
        },
      },
    },
  });

  return reply.status(200).send({
    comments: comments.map(({ video, ...comment }) => ({
      ...comment,
      videos: video
        ? {
            title: video.title,
            video_products: video.video_products.map(({ product }) => ({
              products: { name: product.name },
            })),
          }
        : null,
    })),
  });
}
