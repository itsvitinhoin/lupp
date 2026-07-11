import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import {
  exchangeNuvemshopToken,
  nuvemshopApiBase,
  nuvemshopAppId,
  nuvemshopRequest,
  verifyNuvemshopState,
} from "@/lib/nuvemshop";
import { edgeErrorSchemas } from "@/schemas/http-errors";

// Ported from supabase/functions/nuvemshop-oauth-callback. Public route hit
// by the Nuvemshop redirect; every outcome is a 302 back to the SPA with
// machine-readable query params (error=... / connected=nuvemshop).
const QuerySchema = z.object({
  code: z.string().optional().describe("OAuth authorization code from Nuvemshop."),
  state: z.string().optional().describe("HMAC-signed state issued by oauth/start."),
});

export const NuvemshopOauthCallbackSchema = {
  schema: {
    summary: "Nuvemshop OAuth callback",
    description:
      "Verifies the signed OAuth state, exchanges the code for an access token, " +
      "upserts the integration + secret (guarding against the same Nuvemshop store " +
      "being connected to another Luup store), marks the store's platform and " +
      "best-effort persists the storefront domains. Always responds with a 302 " +
      "redirect back to the SPA (connected=nuvemshop on success, error=... otherwise).",
    tags: ["nuvemshop"],
    operationId: "nuvemshopOauthCallback",
    querystring: QuerySchema,
    response: {
      ...edgeErrorSchemas,
    },
  },
};

function redirectWith(
  reply: FastifyReply,
  url: string,
  params: Record<string, string>,
) {
  const nextUrl = new URL(url);
  Object.entries(params).forEach(([key, value]) => nextUrl.searchParams.set(key, value));
  return reply.redirect(nextUrl.toString(), 302);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function nuvemshopOauthCallbackHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { code, state } = QuerySchema.parse(request.query ?? {});
  const appId = nuvemshopAppId();
  const clientSecret = env.NUVEMSHOP_CLIENT_SECRET;
  const stateSecret = env.NUVEMSHOP_STATE_SECRET;
  const fallbackReturnTo = `${env.LUPP_APP_URL}/app/integrations`;
  const restartInstallUrl = `${fallbackReturnTo}?connect=nuvemshop&install_retry=1`;

  if (!clientSecret || !stateSecret) {
    return redirectWith(reply, fallbackReturnTo, {
      error: "missing_nuvemshop_server_config",
      provider: "nuvemshop",
    });
  }

  if (!code || !state) {
    return reply.redirect(restartInstallUrl, 302);
  }

  const payload = verifyNuvemshopState(state, stateSecret);
  if (!payload?.store_id) {
    return redirectWith(reply, fallbackReturnTo, {
      error: "invalid_oauth_state",
      provider: "nuvemshop",
    });
  }

  const returnTo = payload.return_to || fallbackReturnTo;
  const tokenResult = await exchangeNuvemshopToken(code);
  const tokenData = tokenResult.data;

  if (!tokenResult.ok || !tokenData.access_token || !tokenData.user_id) {
    return redirectWith(reply, returnTo, {
      error: "nuvemshop_token_exchange_failed",
      provider: "nuvemshop",
    });
  }

  const externalStoreId = String(tokenData.user_id);
  const now = new Date();
  const integrationData = {
    connected_at: now,
    credentials: {
      scope: tokenData.scope || null,
      token_type: tokenData.token_type || "bearer",
    },
    external_store_id: externalStoreId,
    settings: {
      app_id: appId,
      connected_via: "oauth",
      nuvemshop_store_id: externalStoreId,
    },
    status: "active",
  };

  let integration: { id: string } | null = null;
  try {
    integration = await prisma.integration.upsert({
      where: {
        store_id_provider: { store_id: payload.store_id, provider: "nuvemshop" },
      },
      create: {
        ...integrationData,
        provider: "nuvemshop",
        store_id: payload.store_id,
      },
      update: integrationData,
      select: { id: true },
    });
  } catch {
    // The upsert can violate the (provider, external_store_id) unique when
    // this Nuvemshop store is already connected to a different Luup store —
    // the original surfaced that as a dedicated error, otherwise retried as
    // an update on the row that owns the external store id.
    const existingExternal = await prisma.integration
      .findUnique({
        where: {
          provider_external_store_id: {
            provider: "nuvemshop",
            external_store_id: externalStoreId,
          },
        },
        select: { id: true, store_id: true },
      })
      .catch(() => null);

    if (!existingExternal) {
      return redirectWith(reply, returnTo, {
        error: "luup_integration_save_failed",
        provider: "nuvemshop",
      });
    }

    if (existingExternal.store_id !== payload.store_id) {
      return redirectWith(reply, returnTo, {
        error:
          "luup_integration_save_failed:nuvemshop_store_already_connected_to_another_luup_store",
        provider: "nuvemshop",
      });
    }

    integration = await prisma.integration
      .update({
        where: { id: existingExternal.id },
        data: integrationData,
        select: { id: true },
      })
      .catch(() => null);
  }

  if (!integration) {
    return redirectWith(reply, returnTo, {
      error: "luup_integration_save_failed",
      provider: "nuvemshop",
    });
  }

  const secretData = {
    access_token: tokenData.access_token,
    external_store_id: externalStoreId,
    metadata: { app_id: appId },
    provider: "nuvemshop",
    scope: tokenData.scope || null,
    token_type: tokenData.token_type || "bearer",
  };

  try {
    await prisma.integrationSecret.upsert({
      where: { integration_id: integration.id },
      create: { ...secretData, integration_id: integration.id },
      update: secretData,
    });
  } catch {
    return redirectWith(reply, returnTo, {
      error: "luup_integration_secret_save_failed",
      provider: "nuvemshop",
    });
  }

  await prisma.store.updateMany({
    where: { id: payload.store_id },
    data: { platform: "nuvemshop" },
  });

  // Best-effort: persist the storefront domains right away so the public
  // widget bootstrap can resolve this store by domain before the first
  // product sync runs. Failures here must not break the OAuth flow.
  try {
    const storeResult = await nuvemshopRequest(
      `${nuvemshopApiBase(externalStoreId)}/store`,
      {
        headers: {
          // Tiendanube's legacy "Authentication" header — kept exactly as
          // the original callback sent it.
          Authentication: `bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
          "User-Agent": process.env.NUVEMSHOP_USER_AGENT || "Luup (playluup.com.br)",
        },
      },
    );

    if (storeResult.ok) {
      const nuvemshopStore = storeResult.data as {
        domains?: string[] | null;
        original_domain?: string | null;
      };
      const currentIntegration = await prisma.integration.findUnique({
        where: { id: integration.id },
        select: { settings: true },
      });
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          settings: {
            ...asRecord(currentIntegration?.settings),
            nuvemshop_domains: Array.isArray(nuvemshopStore.domains)
              ? nuvemshopStore.domains
              : [],
            nuvemshop_original_domain: nuvemshopStore.original_domain || null,
          },
        },
      });
    }
  } catch {
    // Domain persistence is an optimization; the product sync repeats it.
  }

  return redirectWith(reply, returnTo, {
    connected: "nuvemshop",
    provider: "nuvemshop",
  });
}
