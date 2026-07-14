import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { IntegrationRowSchema } from "@/schemas/rows";
import { INTEGRATION_SELECT } from "./list-integrations";

const BodySchema = z.object({
  store_id: z.string().min(1),
  provider: z.enum(["ga4", "meta_pixel", "tiktok_pixel", "webhook"]),
  settings: z.record(z.string(), z.string()),
});

export const UpsertTrackingSchema = {
  schema: {
    summary: "Upsert tracking settings",
    description:
      "Creates or updates a tracking integration (GA4, Meta/TikTok pixel, " +
      "webhook). Status follows settings.enabled: active when \"true\", " +
      "available otherwise.",
    tags: ["integrations"],
    operationId: "upsertTrackingSettings",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ integration: IntegrationRowSchema }),
      ...edgeErrorSchemas,
    },
  },
};

export async function upsertTrackingHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = BodySchema.parse(request.body);

  const member = await findStoreMembership(request.user.sub, body.store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const status = body.settings.enabled === "true" ? "active" : "available";

  const integration = await prisma.integration.upsert({
    where: {
      store_id_provider: { store_id: body.store_id, provider: body.provider },
    },
    create: {
      store_id: body.store_id,
      provider: body.provider,
      status,
      settings: body.settings,
    },
    update: { status, settings: body.settings },
    select: INTEGRATION_SELECT,
  });

  return reply.status(200).send({ integration });
}
