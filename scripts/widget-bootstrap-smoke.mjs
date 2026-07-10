#!/usr/bin/env node

const baseUrl = (
  process.env.LUPP_BOOTSTRAP_URL ||
  "https://duktrvqfbvpfajuajhci.supabase.co/functions/v1/lupp-widget-bootstrap"
).replace(/\/$/, "");

const checks = [
  {
    name: "upzero phize floating launcher",
    params: {
      store_id: "c322b7b4-22ce-4ff2-ad42-0a2cce9af325",
      widget: "floating_launcher",
    },
    expect: ({ payload }) =>
      payload.active === true &&
      payload.store?.platform === "upzero" &&
      Array.isArray(payload.videos) &&
      payload.videos.length > 0 &&
      payload.widget?.type === "floating_video",
  },
  {
    name: "upzero phize home carousel",
    params: {
      store_id: "c322b7b4-22ce-4ff2-ad42-0a2cce9af325",
      widget: "home_carousel",
    },
    expect: ({ payload }) =>
      payload.active === true &&
      payload.store?.platform === "upzero" &&
      Array.isArray(payload.videos) &&
      payload.videos.length > 0 &&
      payload.widget?.type === "floating_video" &&
      payload.widget?.settings?.carousel?.enabled !== false,
  },
  {
    name: "shopify osang floating launcher by domain",
    params: {
      external_store_id: "osang-brasil.myshopify.com",
      provider: "shopify",
      widget: "floating_launcher",
    },
    expect: ({ payload }) =>
      payload.active === true &&
      payload.store?.platform === "shopify" &&
      payload.store?.slug === "osang" &&
      Array.isArray(payload.videos) &&
      payload.videos.length > 0,
  },
  {
    name: "shopify osang home carousel by domain",
    params: {
      external_store_id: "osang-brasil.myshopify.com",
      provider: "shopify",
      widget: "home_carousel",
    },
    expect: ({ payload }) =>
      payload.active === true &&
      payload.store?.platform === "shopify" &&
      payload.widget?.type === "floating_video" &&
      payload.widget?.settings?.carousel?.enabled !== false,
  },
  {
    name: "nuvemshop testdev floating launcher by domain",
    params: {
      provider: "nuvemshop",
      store_domain: "lojadevteste4.lojavirtualnuvem.com.br",
      widget: "floating_launcher",
    },
    expect: ({ payload }) =>
      payload.active === true &&
      payload.store?.platform === "nuvemshop" &&
      payload.store?.slug === "teste-dev" &&
      Array.isArray(payload.videos) &&
      payload.videos.length > 0,
  },
  {
    name: "nuvemshop benj billing gate",
    params: {
      provider: "nuvemshop",
      store_domain: "benj.com.br",
      widget: "floating_launcher",
    },
    expect: ({ payload, response }) =>
      response.status === 200 &&
      payload.active === false &&
      payload.error === "trial_expired" &&
      payload.store?.slug === "benj",
  },
];

const secretPatterns = [
  /data-supabase-key/i,
  /UPZERO_(?:STOREFRONT_)?API_KEY/i,
  new RegExp(["upzero", "storefront", "key"].join("_"), "i"),
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /shpat_[A-Za-z0-9_]+/i,
  /\$aact_[A-Za-z0-9_.-]+/i,
];

function urlFor(params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(urlFor(check.params), {
      cache: "no-store",
      headers: { "User-Agent": "luup-widget-bootstrap-smoke/1.0" },
      signal: controller.signal,
    });
    const body = await response.text();
    for (const pattern of secretPatterns) {
      if (pattern.test(body)) throw new Error("bootstrap payload leaked secret-like data");
    }
    const payload = JSON.parse(body);
    if (!check.expect({ body, payload, response })) {
      throw new Error(
        `unexpected response ${response.status}: ${JSON.stringify({
          active: payload.active,
          error: payload.error,
          store: payload.store?.slug,
          platform: payload.store?.platform,
          videos: Array.isArray(payload.videos) ? payload.videos.length : null,
          widgetType: payload.widget?.type,
        })}`,
      );
    }
    console.log(`ok ${check.name}`);
  } finally {
    clearTimeout(timeout);
  }
}

const failures = [];
for (const check of checks) {
  try {
    await runCheck(check);
  } catch (error) {
    failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error("Widget bootstrap smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Widget bootstrap smoke passed.");
