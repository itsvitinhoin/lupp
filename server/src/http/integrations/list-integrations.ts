import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { IntegrationRowSchema } from "@/schemas/rows";

const QuerySchema = z.object({ store_id: z.string().min(1) });

// credentials may hold connection material — never leaves the server (the
// SPA does not read it; tokens live in integration_secrets anyway).
const INTEGRATION_SELECT = {
  id: true,
  store_id: true,
  provider: true,
  status: true,
  settings: true,
  external_store_id: true,
  connected_at: true,
  last_sync_at: true,
  created_at: true,
  updated_at: true,
} as const;

export const ListIntegrationsSchema = {
  schema: {
    summary: "List integrations",
    description:
      "Integrations of a store the user is a member of, by provider. The " +
      "credentials column is never exposed.",
    tags: ["integrations"],
    operationId: "listIntegrations",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ integrations: z.array(IntegrationRowSchema) }),
      ...edgeErrorSchemas,
    },
  },
};

export async function listIntegrationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id } = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const integrations = await prisma.integration.findMany({
    where: { store_id },
    orderBy: { provider: "asc" },
    select: INTEGRATION_SELECT,
  });

  return reply.status(200).send({ integrations });
}

export { INTEGRATION_SELECT };
