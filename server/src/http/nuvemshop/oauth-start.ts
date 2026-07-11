import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { findStoreMembership } from "@/lib/store-membership";
import { nuvemshopAppId, signNuvemshopState } from "@/lib/nuvemshop";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/nuvemshop-oauth-start. Field checks stay in
// the handler so the machine-readable error codes are preserved.
const BodySchema = z.object({
  store_id: z.string().optional().describe("Store to connect to Nuvemshop."),
  return_to: z
    .string()
    .optional()
    .describe("SPA URL to return to after OAuth (defaults to /app/integrations)."),
});

export const NuvemshopOauthStartSchema = {
  schema: {
    summary: "Start Nuvemshop OAuth",
    description:
      "Builds the Nuvemshop/Tiendanube authorize URL for the store, embedding an " +
      "HMAC-signed state (store, user, return URL, 30-minute TTL) that the OAuth " +
      "callback verifies. Returns 403 when the caller is not a member of the store.",
    tags: ["nuvemshop"],
    operationId: "nuvemshopOauthStart",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({ authorize_url: z.string() }),
      ...edgeErrorSchemas,
    },
  },
};

export async function nuvemshopOauthStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const stateSecret = env.NUVEMSHOP_STATE_SECRET;
  if (!stateSecret) {
    return reply.status(500).send({ error: "missing_server_config" });
  }

  const body = BodySchema.parse(request.body ?? {});
  const storeId = (body.store_id ?? "").trim();
  const returnTo = (body.return_to || `${env.LUPP_APP_URL}/app/integrations`).trim();

  if (!storeId) return reply.status(400).send({ error: "missing_store_id" });

  const member = await findStoreMembership(request.user.sub, storeId);
  if (!member) return reply.status(403).send({ error: "store_access_denied" });

  const state = signNuvemshopState(
    {
      iat: Math.floor(Date.now() / 1000),
      return_to: returnTo,
      store_id: storeId,
      user_id: request.user.sub,
    },
    stateSecret,
  );

  const authorizeUrl = new URL(
    `/apps/${nuvemshopAppId()}/authorize`,
    env.NUVEMSHOP_AUTHORIZE_BASE_URL,
  );
  authorizeUrl.searchParams.set("state", state);

  return reply.status(200).send({ authorize_url: authorizeUrl.toString() });
}
