import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const ParamsSchema = z.object({ commentId: z.string().min(1) });

export const DeleteCommentSchema = {
  schema: {
    summary: "Delete comment",
    description: "Hard-deletes a comment on a store the user is a member of.",
    tags: ["comments"],
    operationId: "deleteComment",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    response: {
      200: z.object({ ok: z.literal(true) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function deleteCommentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { commentId } = ParamsSchema.parse(request.params);

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { store_id: true },
  });
  if (!existing) return reply.status(404).send({ error: "comment_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  await prisma.comment.delete({ where: { id: commentId } });
  return reply.status(200).send({ ok: true });
}
