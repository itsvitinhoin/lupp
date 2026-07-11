import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import {
  buildShopifyAuthorizeUrl,
  decodeShopifySessionTokenPayload,
  resolveShopifyAppConfig,
  shopifyAppUrl,
  shopifyRedirectUri,
  signShopifyState,
  verifyShopifySessionToken,
} from "@/lib/shopify";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/shopify-embedded-session. Public: the bearer
// token is a Shopify SESSION token (HS256 with the app secret, not our JWT),
// so verification happens in the handler, not via @fastify/jwt.
const BodySchema = z.object({
  host: z
    .string()
    .optional()
    .describe("App Bridge host param, echoed into the bootstrap return URL."),
  shop: z.string().optional().describe("Shop domain (informational)."),
});

export const ShopifyEmbeddedSessionSchema = {
  schema: {
    summary: "Resolve Shopify embedded session",
    description:
      "Verifies a Shopify embedded-app session token (HS256 with the app secret; exp/nbf/aud/" +
      "dest checks) and returns the connected store context. When the shop has no integration " +
      "or stored access token yet, replies 409 with an authorize_url whose signed state runs " +
      "the embedded_bootstrap OAuth flow.",
    tags: ["shopify"],
    operationId: "shopifyEmbeddedSession",
    security: [{ bearerAuth: [] }],
    body: BodySchema,
    response: {
      200: z.object({
        integration: z.any(),
        ok: z.boolean(),
        profile: z.any().nullable(),
        shop: z.string(),
        store: z.any(),
        user: z.any(),
      }),
      ...edgeErrorSchemas,
      404: z.object({ error: z.string(), shop: z.string().optional() }),
      409: z.object({
        authorize_url: z.string(),
        error: z.string(),
        shop: z.string(),
      }),
    },
  },
};

function buildReturnTo(appUrl: string, shop: string, host?: string) {
  const url = new URL("/app", appUrl);
  url.searchParams.set("shop", shop);
  if (host) url.searchParams.set("host", host);
  return url.toString();
}

function buildBootstrapAuthorizeUrl(params: {
  apiKey: string;
  host?: string;
  scopes: string;
  shop: string;
  stateSecret: string;
}) {
  const state = signShopifyState(
    {
      host: params.host || null,
      iat: Math.floor(Date.now() / 1000),
      mode: "embedded_bootstrap",
      return_to: buildReturnTo(shopifyAppUrl(), params.shop, params.host),
      shop: params.shop,
    },
    params.stateSecret,
  );

  return buildShopifyAuthorizeUrl({
    apiKey: params.apiKey,
    redirectUri: shopifyRedirectUri(),
    scopes: params.scopes,
    shop: params.shop,
    state,
  });
}

export async function shopifyEmbeddedSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const stateSecret = env.SHOPIFY_STATE_SECRET;
  if (!stateSecret) {
    return reply.status(500).send({ error: "missing_server_config" });
  }

  const body = BodySchema.parse(request.body ?? {});

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
    return reply.status(500).send({ error: "missing_shopify_app_config" });
  }

  const verification = verifyShopifySessionToken(
    token,
    appConfig.apiKey,
    appConfig.apiSecret,
  );
  if ("error" in verification) {
    return reply.status(401).send({ error: verification.error });
  }

  const shop = new URL(verification.payload.dest).hostname.toLowerCase();

  let integration;
  try {
    integration = await prisma.integration.findFirst({
      where: {
        provider: "shopify",
        external_store_id: { in: [shop, `https://${shop}`] },
      },
      select: {
        id: true,
        store_id: true,
        provider: true,
        status: true,
        external_store_id: true,
      },
    });
  } catch (error) {
    return reply.status(500).send({
      error: `integration_lookup_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  const oauthRequired = () =>
    reply.status(409).send({
      authorize_url: buildBootstrapAuthorizeUrl({
        apiKey: appConfig.apiKey,
        host: body.host,
        scopes: appConfig.scopes,
        shop,
        stateSecret,
      }),
      error: "shopify_oauth_required",
      shop,
    });

  if (!integration?.store_id) {
    return oauthRequired();
  }

  let secret;
  try {
    secret = await prisma.integrationSecret.findUnique({
      where: { integration_id: integration.id },
      select: { integration_id: true, access_token: true },
    });
  } catch (error) {
    return reply.status(500).send({
      error: `integration_secret_lookup_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  if (!secret?.access_token) {
    return oauthRequired();
  }

  let store;
  try {
    store = await prisma.store.findUnique({
      where: { id: integration.store_id },
    });
  } catch (error) {
    return reply.status(500).send({
      error: `store_lookup_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
  if (!store) {
    return reply.status(404).send({ error: "store_not_found", shop });
  }

  // The original read the profiles table; profiles are merged into users here.
  // password_hash must never leave the server, hence the explicit select.
  const profile = await prisma.user.findUnique({
    where: { id: store.owner_id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar_url: true,
      created_at: true,
      updated_at: true,
    },
  });

  return reply.status(200).send({
    integration,
    ok: true,
    profile: profile ?? null,
    shop,
    store,
    user: {
      app_metadata: { provider: "shopify_embedded" },
      aud: "authenticated",
      created_at: store.created_at,
      email: profile?.email ?? `${shop}@shopify.luup.local`,
      id: store.owner_id,
      role: "authenticated",
      user_metadata: {
        name: profile?.name ?? store.name,
        shop,
      },
    },
  });
}
