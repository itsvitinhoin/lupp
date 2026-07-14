import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { buildFloatingEnsureSettings } from "@/lib/widget-defaults";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { WidgetRowSchema } from "@/schemas/rows";
import { Prisma } from "../../../generated/prisma/client";

const BodySchema = z.object({ store_id: z.string().min(1) });

export const EnsureFloatingSchema = {
  schema: {
    summary: "Ensure floating widget for product pages",
    description:
      "Creates (or reactivates + normalizes) the store's floating_video " +
      "widget so product pages render: forces display mode=all with default " +
      "exclusions and seeds the carousel block. Ported from the SPA's " +
      "ensureFloatingWidgetForProductPage.",
    tags: ["widgets"],
    operationId: "ensureFloatingWidget",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ widget: WidgetRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function ensureFloatingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id } = BodySchema.parse(request.body);

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const existing = await prisma.widget.findFirst({
    where: { store_id, type: "floating_video" },
    orderBy: { created_at: "asc" },
  });

  const nextSettings = buildFloatingEnsureSettings(existing?.settings) as Prisma.InputJsonValue;

  const widget = existing
    ? await prisma.widget.update({
        where: { id: existing.id },
        data: { settings: nextSettings, status: "active" },
      })
    : await prisma.widget.create({
        data: {
          store_id,
          name: "Floating Video",
          type: "floating_video",
          target: "site",
          status: "active",
          settings: nextSettings,
        },
      });

  return reply.status(200).send({ widget });
}
