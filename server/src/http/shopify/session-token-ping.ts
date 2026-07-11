import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  decodeShopifySessionTokenPayload,
  resolveShopifyAppConfig,
  verifyShopifySessionToken,
} from "@/lib/shopify";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/shopify-session-token-ping. Public: verifies
// a Shopify embedded-app session token and echoes its identity claims — the
// SPA uses it as a cheap "is my App Bridge token still valid?" probe.
export const ShopifySessionTokenPingSchema = {
  schema: {
    summary: "Ping with a Shopify session token",
    description:
      "Verifies a Shopify embedded-app session token (HS256 with the app secret; exp/nbf/aud/" +
      "dest checks) and returns its dest/sub claims. 401 with the specific token error code " +
      "when verification fails.",
    tags: ["shopify"],
    operationId: "shopifySessionTokenPing",
    security: [{ bearerAuth: [] }],
    response: {
      200: z.object({
        ok: z.boolean(),
        dest: z.string().optional(),
        sub: z.string().optional(),
      }),
      ...edgeErrorSchemas,
    },
  },
};

export async function shopifySessionTokenPingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authorization = request.headers.authorization || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return reply.status(401).send({ error: "missing_session_token" });
  }

  const untrustedPayload = decodeShopifySessionTokenPayload(token);
  const appConfig = resolveShopifyAppConfig({
    apiKey: untrustedPayload?.aud,
    shop: untrustedPayload?.dest,
  });
  if (!appConfig) {
    return reply.status(500).send({ error: "missing_server_config" });
  }

  const verification = verifyShopifySessionToken(
    token,
    appConfig.apiKey,
    appConfig.apiSecret,
  );
  if ("error" in verification) {
    return reply.status(401).send({ error: verification.error });
  }

  return reply.status(200).send({
    ok: true,
    dest: verification.payload.dest,
    sub: verification.payload.sub,
  });
}
