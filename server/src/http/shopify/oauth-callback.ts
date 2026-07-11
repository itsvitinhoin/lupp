import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import {
  requestShopifyAccessToken,
  resolveShopifyAppConfig,
  shopifyAppUrl,
  shopifyTokenExpiresAt,
  verifyShopifyRequestHmac,
  verifyShopifyState,
} from "@/lib/shopify";
import { Prisma } from "../../../generated/prisma/client";

// Ported from supabase/functions/shopify-oauth-callback. Shopify redirects the
// merchant's browser here, so every outcome — including failures — is a 302
// back to the SPA with machine-readable query params, never a JSON body.
export const ShopifyOauthCallbackSchema = {
  schema: {
    summary: "Shopify OAuth callback",
    description:
      "Public browser redirect target for Shopify OAuth. Verifies the signed state and " +
      "Shopify's request HMAC, exchanges the code for an access token and stores the " +
      "integration + secret. In `embedded_bootstrap` mode (embedded app installed before any " +
      "Lupp account exists) it provisions a full store: owner user, store, membership, trial " +
      "subscription, default widgets, custom page and feed settings. Always redirects (302) " +
      "back to the SPA with `connected=shopify` or `error=<code>`.",
    tags: ["shopify"],
    operationId: "shopifyOauthCallback",
    querystring: z.record(z.string(), z.string()),
    response: {
      302: z
        .null()
        .describe("Redirect back to the SPA with result query params."),
    },
  },
};

function expiresAt(seconds: number | undefined) {
  return shopifyTokenExpiresAt(seconds);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function titleFromShop(shop: string) {
  const name = shop
    .replace(/\.myshopify\.com$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return name
    ? name.replace(/\b\w/g, (match) => match.toUpperCase())
    : "Loja Shopify";
}

function uniqueEmailForShop(shop: string, attempt: number) {
  const safeShop = shop
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const suffix = attempt === 0 ? "" : `-${randomUUID().slice(0, 8)}`;
  return `shopify+${safeShop}${suffix}@playluup.local`;
}

// The original created a Supabase auth user with a random password; here the
// User row gets a random-uuid password_hash placeholder — bootstrap owners
// only ever sign in through the embedded app, never with a password.
async function createBootstrapOwner(shop: string, storeName: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const email = uniqueEmailForShop(shop, attempt);
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: storeName,
          password_hash: randomUUID(),
        },
      });
      return { email, userId: user.id };
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!isDuplicate) {
        throw new Error(
          error instanceof Error && error.message
            ? error.message
            : "shopify_bootstrap_user_create_failed",
        );
      }
    }
  }

  throw new Error("shopify_bootstrap_user_duplicate");
}

async function ensureShopifyBootstrapStore(shop: string) {
  const existingIntegration = await prisma.integration.findFirst({
    where: {
      provider: "shopify",
      external_store_id: { in: [shop, `https://${shop}`] },
    },
    select: { store_id: true },
  });

  if (existingIntegration?.store_id) {
    return existingIntegration.store_id;
  }

  const storeName = titleFromShop(shop);
  const owner = await createBootstrapOwner(shop, storeName);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // The original also upserted a profiles row; profiles are merged into the
  // users table in this server, so createBootstrapOwner already covered it.
  const baseSlug = slugify(storeName) || "shopify";
  const store = await prisma.store.create({
    data: {
      name: storeName,
      owner_id: owner.userId,
      plan_id: "start",
      platform: "shopify",
      segment: "ecommerce",
      slug: `${baseSlug}-${randomUUID().slice(0, 6)}`,
      trial_ends_at: trialEndsAt,
      trial_started_at: now,
      url: `https://${shop}`,
    },
    select: { id: true },
  });

  const storeId = store.id;
  await prisma.storeMember.create({
    data: { role: "owner", store_id: storeId, user_id: owner.userId },
  });

  await prisma.subscription.create({
    data: {
      current_period_end: trialEndsAt,
      current_period_start: now,
      plan_id: "start",
      status: "trialing",
      store_id: storeId,
    },
  });

  await prisma.widget.createMany({
    data: [
      {
        name: "Product Video",
        status: "inactive",
        store_id: storeId,
        target: "product",
        type: "product_video",
      },
      {
        name: "Home Showcase",
        status: "inactive",
        store_id: storeId,
        target: "home",
        type: "home_showcase",
      },
      {
        name: "Floating Video",
        status: "active",
        store_id: storeId,
        target: "site",
        type: "floating_video",
        settings: {
          display: {
            mode: "all",
            include_paths: [],
            exclude_paths: ["/checkout", "/carrinho", "/cart"],
            product_mode: "linked_or_all",
            hide_without_videos: false,
            home_experience_enabled: true,
            home_ordering: "manual",
          },
          carousel: {
            enabled: true,
            title: "Descubra cada detalhe e Compre",
            description: "",
            before_heading: "Com Capa",
            max_items: 12,
            mobile_max_items: 6,
          },
        },
      },
      {
        name: "Stories Bar",
        status: "inactive",
        store_id: storeId,
        target: "site",
        type: "stories_bar",
      },
    ],
  });

  await prisma.customPage.create({
    data: {
      name: "Feed Principal",
      slug: "videos",
      status: "draft",
      store_id: storeId,
    },
  });

  await prisma.feedSetting.create({
    data: { slug: "videos", store_id: storeId },
  });

  return storeId;
}

export async function shopifyOauthCallbackHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = request.query as Record<string, string>;
  const redirectTo = (url: string, params: Record<string, string>) => {
    const nextUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) =>
      nextUrl.searchParams.set(key, value),
    );
    return reply.redirect(nextUrl.toString(), 302);
  };

  const code = query.code || "";
  const shop = String(query.shop || "").toLowerCase();
  const state = query.state || "";
  const stateSecret = env.SHOPIFY_STATE_SECRET;
  const fallbackReturnTo = `${shopifyAppUrl()}/app/integrations`;

  if (!stateSecret) {
    return redirectTo(fallbackReturnTo, {
      error: "missing_shopify_server_config",
      provider: "shopify",
    });
  }

  if (!code || !shop || !state) {
    return redirectTo(fallbackReturnTo, {
      error: "missing_shopify_oauth_params",
      provider: "shopify",
    });
  }

  const payload = verifyShopifyState(state, stateSecret);
  if (!payload || payload.shop !== shop) {
    return redirectTo(fallbackReturnTo, {
      error: "invalid_oauth_state",
      provider: "shopify",
    });
  }

  const appConfig = resolveShopifyAppConfig({ shop });
  if (!appConfig) {
    return redirectTo(fallbackReturnTo, {
      error: "missing_shopify_app_config",
      provider: "shopify",
    });
  }

  if (!verifyShopifyRequestHmac(query, appConfig.apiSecret)) {
    return redirectTo(fallbackReturnTo, {
      error: "invalid_shopify_hmac",
      provider: "shopify",
    });
  }

  const returnTo = payload.return_to || fallbackReturnTo;
  const tokenResult = await requestShopifyAccessToken(shop, {
    client_id: appConfig.apiKey,
    client_secret: appConfig.apiSecret,
    code,
    expiring: "1",
  });
  const accessToken = tokenResult.payload.access_token;
  if (!tokenResult.ok || !accessToken) {
    return redirectTo(returnTo, {
      error: "shopify_token_exchange_failed",
      provider: "shopify",
    });
  }
  const tokenData = tokenResult.payload;

  let storeId = payload.store_id || "";
  if (payload.mode === "embedded_bootstrap") {
    try {
      storeId = await ensureShopifyBootstrapStore(shop);
    } catch (error) {
      return redirectTo(returnTo, {
        error:
          error instanceof Error
            ? `shopify_bootstrap_failed:${error.message}`
            : "shopify_bootstrap_failed",
        provider: "shopify",
      });
    }
  }

  if (!storeId) {
    return redirectTo(returnTo, {
      error: "missing_store_for_shopify_oauth",
      provider: "shopify",
    });
  }

  const now = new Date();
  const integrationData = {
    connected_at: now,
    credentials: {
      scope: tokenData.scope || null,
      token_type: "bearer",
    },
    external_store_id: shop,
    settings: {
      connected_via: "oauth",
      shop_domain: shop,
    },
    status: "active",
  };

  let integrationId = "";
  try {
    const integration = await prisma.integration.upsert({
      where: {
        store_id_provider: { store_id: storeId, provider: "shopify" },
      },
      create: { ...integrationData, provider: "shopify", store_id: storeId },
      update: integrationData,
      select: { id: true },
    });
    integrationId = integration.id;
  } catch (error) {
    return redirectTo(returnTo, {
      error:
        error instanceof Error && error.message
          ? `luup_integration_save_failed:${error.message}`
          : "luup_integration_save_failed",
      provider: "shopify",
    });
  }

  const secretData = {
    access_token: accessToken,
    external_store_id: shop,
    metadata: {
      access_token_expires_at: expiresAt(tokenData.expires_in),
      expiring_offline: Boolean(tokenData.refresh_token),
      refresh_token: tokenData.refresh_token || null,
      refresh_token_expires_at: expiresAt(tokenData.refresh_token_expires_in),
      shop_domain: shop,
    },
    scope: tokenData.scope || null,
    token_type: "bearer",
  };

  try {
    await prisma.integrationSecret.upsert({
      where: { integration_id: integrationId },
      create: {
        ...secretData,
        integration_id: integrationId,
        provider: "shopify",
      },
      update: secretData,
    });
  } catch {
    return redirectTo(returnTo, {
      error: "luup_integration_secret_save_failed",
      provider: "shopify",
    });
  }

  // Best-effort, like the original (its error was ignored).
  await prisma.store
    .update({ where: { id: storeId }, data: { platform: "shopify" } })
    .catch(() => undefined);

  return redirectTo(returnTo, {
    connected: "shopify",
    provider: "shopify",
  });
}
