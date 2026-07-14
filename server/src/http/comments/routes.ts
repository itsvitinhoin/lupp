import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { env } from "@/env";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { listCommentsHandler, ListCommentsSchema } from "./list-comments";
import { updateCommentHandler, UpdateCommentSchema } from "./update-comment";
import { deleteCommentHandler, DeleteCommentSchema } from "./delete-comment";
import {
  createPublicCommentHandler,
  CreatePublicCommentSchema,
  listPublicCommentsHandler,
  ListPublicCommentsSchema,
} from "./public-comments";

const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: "1m" } });

export async function CommentRoutes(app: FastifyTypedInstance) {
  app.get(
    "/api/comments",
    { schema: ListCommentsSchema.schema, preHandler: [verifyJwt] },
    listCommentsHandler,
  );
  // Public storefront surface — the write is the abuse target.
  app.get(
    "/api/comments/public",
    { schema: ListPublicCommentsSchema.schema, config: perMinute(60) },
    listPublicCommentsHandler,
  );
  app.post(
    "/api/comments/public",
    {
      schema: CreatePublicCommentSchema.schema,
      config: perMinute(env.RATE_LIMIT_PUBLIC_WRITE_MAX),
    },
    createPublicCommentHandler,
  );
  app.patch(
    "/api/comments/:commentId",
    { schema: UpdateCommentSchema.schema, preHandler: [verifyJwt] },
    updateCommentHandler,
  );
  app.delete(
    "/api/comments/:commentId",
    { schema: DeleteCommentSchema.schema, preHandler: [verifyJwt] },
    deleteCommentHandler,
  );
}
