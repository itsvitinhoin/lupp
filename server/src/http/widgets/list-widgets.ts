import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { canOperateStore } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { WidgetRowSchema } from "@/schemas/rows";

const QuerySchema = z.object({
  store_id: z.string().min(1),
  status: z.enum(["active", "inactive"]).optional(),
});

export const ListWidgetsSchema = {
  schema: {
    summary: "List widgets",
    description: "Widgets of a store the user is a member of, oldest first.",
    tags: ["widgets"],
    operationId: "listWidgets",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ widgets: z.array(WidgetRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listWidgetsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = QuerySchema.parse(request.query ?? {});

  const allowed = await canOperateStore(request.user.sub, query.store_id);
  if (!allowed) return reply.status(403).send({ error: "store_access_denied" });

  const widgets = await prisma.widget.findMany({
    where: { store_id: query.store_id, ...(query.status ? { status: query.status } : {}) },
    orderBy: { created_at: "asc" },
  });

  return reply.status(200).send({ widgets });
}
