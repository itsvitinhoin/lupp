import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { CommentRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ commentId: z.string().min(1) });

const BodySchema = z.object({
  status: z.enum(["pending", "approved", "hidden", "reported", "deleted"]).optional(),
  body: z.string().min(1).optional(),
});

export const UpdateCommentSchema = {
  schema: {
    summary: "Update comment (moderation)",
    description: "Moderation surface: status changes and body edits.",
    tags: ["comments"],
    operationId: "updateComment",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    body: BodySchema,
    response: {
      200: z.object({ comment: CommentRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function updateCommentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { commentId } = ParamsSchema.parse(request.params);
  const body = BodySchema.parse(request.body ?? {});

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { store_id: true },
  });
  if (!existing) return reply.status(404).send({ error: "comment_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const comment = await prisma.comment.update({ where: { id: commentId }, data: body });
  return reply.status(200).send({ comment });
}
