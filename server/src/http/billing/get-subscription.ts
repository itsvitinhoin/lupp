import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { findStoreMembership } from "@/lib/store-membership";
import { serializeSubscription } from "@/lib/serialize";
import { edgeErrorSchemas } from "@/schemas/http-errors";
import { SubscriptionRowSchema } from "@/schemas/rows";

const QuerySchema = z.object({ store_id: z.string().min(1) });

export const GetSubscriptionSchema = {
  schema: {
    summary: "Current subscription",
    description: "The store's most recent subscription row, or null.",
    tags: ["billing"],
    operationId: "getCurrentSubscription",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({ subscription: SubscriptionRowSchema.nullable() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function getSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id } = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const subscription = await prisma.subscription.findFirst({
    where: { store_id },
    orderBy: { created_at: "desc" },
  });

  return reply
    .status(200)
    .send({ subscription: subscription ? serializeSubscription(subscription) : null });
}
