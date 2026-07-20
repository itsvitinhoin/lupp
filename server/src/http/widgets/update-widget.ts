import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { mergeWidgetSettings } from "@workspace/widget-config";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { WidgetRowSchema } from "@/schemas/rows";

const ParamsSchema = z.object({ widgetId: z.string().min(1) });

const BodySchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  target: z.string().nullish(),
  settings: z.record(z.string(), z.any()).optional(),
});

export const UpdateWidgetSchema = {
  schema: {
    summary: "Update widget",
    description: "Partial update of a widget's name/status/target/settings.",
    tags: ["widgets"],
    operationId: "updateWidget",
    security: [{ bearerAuth: [] }],
    params: ParamsSchema,
    body: BodySchema,
    response: {
      200: z.object({ widget: WidgetRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function updateWidgetHandler(request: FastifyRequest, reply: FastifyReply) {
  const { widgetId } = ParamsSchema.parse(request.params);
  const body = BodySchema.parse(request.body ?? {});

  const existing = await prisma.widget.findUnique({
    where: { id: widgetId },
    select: { store_id: true, settings: true },
  });
  if (!existing) return reply.status(404).send({ error: "widget_not_found" });

  const member = await findStoreMembership(request.user.sub, existing.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  // Settings PATCHes merge into the stored object (section-wise, normalized —
  // enums/colors/ranges coerced by the shared contract) instead of replacing
  // it, so keys a partial form doesn't send are never silently dropped.
  const data =
    body.settings === undefined
      ? body
      : { ...body, settings: mergeWidgetSettings(existing.settings, body.settings) };

  const widget = await prisma.widget.update({ where: { id: widgetId }, data });
  return reply.status(200).send({ widget });
}
