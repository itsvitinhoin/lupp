import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { resolveShopifyAppConfig } from "../_shared/shopify-app-config.ts";

type ShopifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

type ShopifyOAuthState = {
  host?: string | null;
  iat?: number;
  mode?: "embedded_bootstrap";
  return_to?: string;
  shop?: string;
  store_id?: string;
  user_id?: string;
};

function base64UrlDecode(input: string) {
  const base64 = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hexEncode(input: ArrayBuffer) {
  return Array.from(new Uint8Array(input))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function verifyState(state: string, secret: string) {
  const [encodedPayload, receivedSignature] = state.split(".");
  if (!encodedPayload || !receivedSignature) return null;

  const signature = await hmacSha256(encodedPayload, secret);
  const expectedSignature = base64UrlEncode(signature);
  if (expectedSignature !== receivedSignature) return null;

  const payload = JSON.parse(
    base64UrlDecode(encodedPayload),
  ) as ShopifyOAuthState;

  if (!payload.shop) return null;
  if (
    payload.mode !== "embedded_bootstrap" &&
    (!payload.store_id || !payload.user_id)
  )
    return null;
  if (payload.iat && Date.now() / 1000 - payload.iat > 60 * 30) return null;
  return payload;
}

async function verifyShopifyHmac(reqUrl: URL, secret: string) {
  const params = new URLSearchParams(reqUrl.search);
  const receivedHmac = params.get("hmac") || "";
  if (!receivedHmac) return false;
  params.delete("hmac");
  params.delete("signature");

  const message = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const signature = await hmacSha256(message, secret);
  const expectedHmac = hexEncode(signature);
  return expectedHmac === receivedHmac;
}

function redirectTo(url: string, params: Record<string, string>) {
  const nextUrl = new URL(url);
  Object.entries(params).forEach(([key, value]) =>
    nextUrl.searchParams.set(key, value),
  );
  return Response.redirect(nextUrl.toString(), 302);
}

function expiresAt(seconds: number | undefined) {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
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
  const suffix = attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 8)}`;
  return `shopify+${safeShop}${suffix}@playluup.local`;
}

async function createBootstrapOwner(
  supabase: ReturnType<typeof createClient>,
  shop: string,
  storeName: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const email = uniqueEmailForShop(shop, attempt);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID(),
      user_metadata: {
        name: storeName,
        shopify_shop: shop,
      },
    });

    if (!error && data.user?.id) {
      return { email, userId: data.user.id };
    }

    if (!/already|duplicate|registered/i.test(error?.message || "")) {
      throw new Error(error?.message || "shopify_bootstrap_user_create_failed");
    }
  }

  throw new Error("shopify_bootstrap_user_duplicate");
}

async function ensureShopifyBootstrapStore(
  supabase: ReturnType<typeof createClient>,
  shop: string,
) {
  const existingIntegration = await supabase
    .from("integrations")
    .select("id, store_id")
    .eq("provider", "shopify")
    .in("external_store_id", [shop, `https://${shop}`])
    .maybeSingle();

  if (existingIntegration.error) {
    throw new Error(
      `integration_lookup_failed:${existingIntegration.error.message}`,
    );
  }

  if (existingIntegration.data?.store_id) {
    return existingIntegration.data.store_id as string;
  }

  const storeName = titleFromShop(shop);
  const owner = await createBootstrapOwner(supabase, shop, storeName);
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const profileResult = await supabase.from("profiles").upsert(
    {
      email: owner.email,
      id: owner.userId,
      name: storeName,
    },
    { onConflict: "id" },
  );
  if (profileResult.error) {
    throw new Error(`profile_save_failed:${profileResult.error.message}`);
  }

  const baseSlug = slugify(storeName) || "shopify";
  const storeResult = await supabase
    .from("stores")
    .insert({
      name: storeName,
      owner_id: owner.userId,
      plan_id: "start",
      platform: "shopify",
      segment: "ecommerce",
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
      trial_ends_at: trialEndsAt.toISOString(),
      trial_started_at: now.toISOString(),
      url: `https://${shop}`,
    })
    .select("id")
    .single();

  if (storeResult.error || !storeResult.data?.id) {
    throw new Error(storeResult.error?.message || "store_save_failed");
  }

  const storeId = storeResult.data.id as string;
  const memberResult = await supabase.from("store_members").insert({
    role: "owner",
    store_id: storeId,
    user_id: owner.userId,
  });
  if (memberResult.error)
    throw new Error(`store_member_save_failed:${memberResult.error.message}`);

  const subscriptionResult = await supabase.from("subscriptions").insert({
    current_period_end: trialEndsAt.toISOString(),
    current_period_start: now.toISOString(),
    plan_id: "start",
    status: "trialing",
    store_id: storeId,
  });
  if (subscriptionResult.error) {
    throw new Error(
      `subscription_save_failed:${subscriptionResult.error.message}`,
    );
  }

  const widgetsResult = await supabase.from("widgets").insert([
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
  ]);
  if (widgetsResult.error)
    throw new Error(`widgets_save_failed:${widgetsResult.error.message}`);

  const pageResult = await supabase.from("custom_pages").insert({
    name: "Feed Principal",
    slug: "videos",
    status: "draft",
    store_id: storeId,
  });
  if (pageResult.error)
    throw new Error(`custom_page_save_failed:${pageResult.error.message}`);

  const feedResult = await supabase
    .from("feed_settings")
    .insert({ slug: "videos", store_id: storeId });
  if (feedResult.error)
    throw new Error(`feed_settings_save_failed:${feedResult.error.message}`);

  return storeId;
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const shop = String(reqUrl.searchParams.get("shop") || "").toLowerCase();
  const state = reqUrl.searchParams.get("state");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl =
    Deno.env.get("SHOPIFY_APP_URL") ||
    Deno.env.get("LUPP_APP_URL") ||
    "https://www.playluup.com.br";
  const stateSecret = Deno.env.get("SHOPIFY_STATE_SECRET") || serviceRoleKey;
  const fallbackReturnTo = `${appUrl}/app/integrations`;

  if (!supabaseUrl || !serviceRoleKey || !stateSecret) {
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

  const payload = await verifyState(state, stateSecret).catch(() => null);
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

  const isTrusted = await verifyShopifyHmac(reqUrl, appConfig.apiSecret).catch(
    () => false,
  );
  if (!isTrusted) {
    return redirectTo(fallbackReturnTo, {
      error: "invalid_shopify_hmac",
      provider: "shopify",
    });
  }

  const returnTo = payload.return_to || fallbackReturnTo;
  const tokenBody = new URLSearchParams({
    client_id: appConfig.apiKey,
    client_secret: appConfig.apiSecret,
    code,
    expiring: "1",
  });
  const tokenResponse = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      body: tokenBody.toString(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );

  const tokenData = (await tokenResponse
    .json()
    .catch(() => ({}))) as ShopifyTokenResponse;
  if (!tokenResponse.ok || !tokenData.access_token) {
    return redirectTo(returnTo, {
      error: "shopify_token_exchange_failed",
      provider: "shopify",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let storeId = payload.store_id || "";
  if (payload.mode === "embedded_bootstrap") {
    try {
      storeId = await ensureShopifyBootstrapStore(supabase, shop);
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

  const now = new Date().toISOString();
  const integrationPayload = {
    connected_at: now,
    credentials: {
      scope: tokenData.scope || null,
      token_type: "bearer",
    },
    external_store_id: shop,
    provider: "shopify",
    settings: {
      connected_via: "oauth",
      shop_domain: shop,
    },
    status: "active",
    store_id: storeId,
  };

  const upsertResult = await supabase
    .from("integrations")
    .upsert(integrationPayload, { onConflict: "store_id,provider" })
    .select("id")
    .single();

  if (upsertResult.error || !upsertResult.data?.id) {
    return redirectTo(returnTo, {
      error: upsertResult.error?.message
        ? `luup_integration_save_failed:${upsertResult.error.message}`
        : "luup_integration_save_failed",
      provider: "shopify",
    });
  }

  const { error: secretError } = await supabase
    .from("integration_secrets")
    .upsert(
      {
        access_token: tokenData.access_token,
        external_store_id: shop,
        integration_id: upsertResult.data.id,
        metadata: {
          access_token_expires_at: expiresAt(tokenData.expires_in),
          expiring_offline: Boolean(tokenData.refresh_token),
          refresh_token: tokenData.refresh_token || null,
          refresh_token_expires_at: expiresAt(
            tokenData.refresh_token_expires_in,
          ),
          shop_domain: shop,
        },
        provider: "shopify",
        scope: tokenData.scope || null,
        token_type: "bearer",
      },
      { onConflict: "integration_id" },
    );

  if (secretError) {
    return redirectTo(returnTo, {
      error: "luup_integration_secret_save_failed",
      provider: "shopify",
    });
  }

  await supabase
    .from("stores")
    .update({ platform: "shopify" })
    .eq("id", storeId);

  return redirectTo(returnTo, {
    connected: "shopify",
    provider: "shopify",
  });
});
