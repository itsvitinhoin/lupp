import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { getStoreMonthlyUsage } from "@/lib/billing-access";
import { findStoreMembership } from "@/lib/store-membership";
import { edgeErrorSchemas } from "@/schemas/http-errors";

const QuerySchema = z.object({ store_id: z.string().min(1) });

export const GetUsageSchema = {
  schema: {
    summary: "Monthly usage",
    description:
      "Replaces the get_store_monthly_usage RPC: active videos, calendar-" +
      "month video views and active widgets.",
    tags: ["billing"],
    operationId: "getStoreUsage",
    security: [{ bearerAuth: [] }],
    querystring: QuerySchema,
    response: {
      200: z.object({
        active_videos: z.number(),
        month_views: z.number(),
        active_widgets: z.number(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function getUsageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { store_id } = QuerySchema.parse(request.query ?? {});

  const member = await findStoreMembership(request.user.sub, store_id);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  return reply.status(200).send(await getStoreMonthlyUsage(store_id));
}
