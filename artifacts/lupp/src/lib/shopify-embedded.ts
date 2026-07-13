import type { User } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { TableRow } from "@/types/database";

type ShopifyGlobal = {
  idToken?: () => Promise<string>;
};

declare global {
  interface Window {
    shopify?: ShopifyGlobal;
  }
}

const SESSION_TOKEN_KEY = "luup_shopify_session_token";
const SESSION_TOKEN_API_KEY = "luup_shopify_session_token_api_key";
const SHOP_KEY = "luup_shopify_shop";
const HOST_KEY = "luup_shopify_host";
const PINGED_TOKEN_KEY = "luup_shopify_pinged_session_token";
const APP_BRIDGE_SCRIPT_ID = "luup-shopify-app-bridge";
const SHOPIFY_APP_BRIDGE_SRC =
  "https://cdn.shopify.com/shopifycloud/app-bridge.js";
const SHOPIFY_PUBLIC_API_KEY = "422735bb080ecf76ae0d49bc415df1e3";
const SHOPIFY_APP_CONFIG_KEY = "luup_shopify_app_config_api_key";
const SHOPIFY_APP_CONFIG_CACHE_VERSION = "2026-07-03-custom-apps";

export class ShopifyEmbeddedError extends Error {
  authorizeUrl?: string;
  code: string;
  shop?: string;

  constructor(
    code: string,
    message?: string,
    details?: { authorizeUrl?: string; shop?: string },
  ) {
    super(message || code);
    this.name = "ShopifyEmbeddedError";
    this.code = code;
    this.authorizeUrl = details?.authorizeUrl;
    this.shop = details?.shop;
  }
}

export type ShopifyEmbeddedSession = {
  integration: {
    id: string;
    external_store_id: string | null;
    provider: string;
    status: string;
  };
  profile: TableRow<"profiles"> | null;
  shop: string;
  store: TableRow<"stores">;
  user: User;
};

function decodeShopifyTokenShop(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return "";

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = JSON.parse(window.atob(padded)) as Record<string, unknown>;
    const rawDest = typeof json.dest === "string" ? json.dest : "";
    const host = rawDest
      .replace(/^https?:\/\//i, "")
      .replace(/^\/\//, "")
      .replace(/\/.*$/, "")
      .toLowerCase();

    return host.endsWith(".myshopify.com") ? host : "";
  } catch {
    return "";
  }
}

export function readShopifyLaunchParams() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("shopify_standalone") === "1") return null;
  const shop =
    params.get("shop") || decodeShopifyTokenShop(params.get("id_token") || "");
  const host = params.get("host") || "";
  if (!shop && !host) return null;
  return { host, shop };
}

function persistLaunchParams() {
  const launchParams = readShopifyLaunchParams();
  if (!launchParams) return false;
  if (launchParams.shop)
    window.sessionStorage.setItem(SHOP_KEY, launchParams.shop);
  if (launchParams.host)
    window.sessionStorage.setItem(HOST_KEY, launchParams.host);
  return true;
}

export function getPersistedLaunchParams() {
  if (typeof window === "undefined") return { host: "", shop: "" };
  persistLaunchParams();
  return {
    host: window.sessionStorage.getItem(HOST_KEY) || "",
    shop: window.sessionStorage.getItem(SHOP_KEY) || "",
  };
}

export function isShopifyEmbeddedSession() {
  if (typeof window === "undefined") return false;
  return (
    persistLaunchParams() ||
    Boolean(
      window.sessionStorage.getItem(SHOP_KEY) ||
      window.sessionStorage.getItem(HOST_KEY),
    )
  );
}

export async function getShopifySessionToken() {
  if (typeof window === "undefined") return "";
  if (!isShopifyEmbeddedSession()) return "";

  const currentApiKey =
    document.querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')
      ?.content || "";
  const idToken = window.shopify?.idToken;
  if (typeof idToken !== "function") {
    const cachedApiKey = window.sessionStorage.getItem(SESSION_TOKEN_API_KEY);
    if (cachedApiKey && cachedApiKey === currentApiKey) {
      return window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    }
    return "";
  }

  try {
    const token = await idToken();
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      if (currentApiKey) {
        window.sessionStorage.setItem(SESSION_TOKEN_API_KEY, currentApiKey);
      }
    }
    return token || "";
  } catch {
    const cachedApiKey = window.sessionStorage.getItem(SESSION_TOKEN_API_KEY);
    if (cachedApiKey && cachedApiKey === currentApiKey) {
      return window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    }
    return "";
  }
}

export async function waitForShopifySessionToken() {
  await ensureShopifyEmbeddedRuntime();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const token = await getShopifySessionToken();
    if (token) return token;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return "";
}

export async function fetchShopifyEmbeddedSession(): Promise<ShopifyEmbeddedSession> {
  const token = await waitForShopifySessionToken();
  if (!token) {
    const launchParams = getPersistedLaunchParams();
    throw new ShopifyEmbeddedError(
      "shopify_session_token_missing",
      "Não foi possível iniciar a sessão embedded da Shopify.",
      { shop: launchParams.shop },
    );
  }

  const launchParams = getPersistedLaunchParams();
  // Plain fetch on purpose: the bearer here is a Shopify SESSION token, not
  // the Supabase JWT the shared API client would attach.
  const response = await fetch(
    `${env.apiUrl}/api/integrations/shopify/embedded-session`,
    {
      body: JSON.stringify(launchParams),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      payload?.error === "shopify_oauth_required" &&
      typeof payload?.authorize_url === "string"
    ) {
      throw new ShopifyEmbeddedError(
        "shopify_oauth_required",
        "A Shopify precisa autorizar a Luup para esta loja.",
        {
          authorizeUrl: payload.authorize_url,
          shop:
            typeof payload.shop === "string" ? payload.shop : launchParams.shop,
        },
      );
    }
    const code =
      typeof payload?.error === "string"
        ? payload.error
        : "shopify_embedded_session_failed";
    throw new ShopifyEmbeddedError(code, code.replace(/_/g, " "), {
      shop:
        typeof payload?.shop === "string" ? payload.shop : launchParams.shop,
    });
  }

  return payload as ShopifyEmbeddedSession;
}

async function pingShopifySessionToken(token: string) {
  if (!token || typeof window === "undefined") return;
  if (window.sessionStorage.getItem(PINGED_TOKEN_KEY) === token) return;

  if (!env.apiUrl) return;

  try {
    const response = await fetch(
      `${env.apiUrl}/api/integrations/shopify/session-token-ping`,
      {
        body: "{}",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (response.ok) {
      window.sessionStorage.setItem(PINGED_TOKEN_KEY, token);
    }
  } catch {
    // The ping only exists to prove session-token auth to Shopify and should never block the admin.
  }
}

function ensureShopifyApiKeyMeta(apiKey: string) {
  const existing = document.querySelector<HTMLMetaElement>(
    'meta[name="shopify-api-key"]',
  );
  if (existing) {
    if (existing.content && existing.content !== apiKey) {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      window.sessionStorage.removeItem(SESSION_TOKEN_API_KEY);
      window.sessionStorage.removeItem(PINGED_TOKEN_KEY);
      document.getElementById(APP_BRIDGE_SCRIPT_ID)?.remove();
      try {
        delete (window as Window & { shopify?: ShopifyGlobal }).shopify;
      } catch {
        window.shopify = undefined;
      }
    }
    existing.content = apiKey;
    return;
  }

  const meta = document.createElement("meta");
  meta.name = "shopify-api-key";
  meta.content = apiKey;
  document.head.appendChild(meta);
}

async function resolveShopifyPublicApiKey() {
  if (typeof window === "undefined") return getShopifyPublicApiKey();

  const persisted = getPersistedLaunchParams();
  const shop = persisted.shop;
  const fallback = getShopifyPublicApiKey();
  if (!shop) return fallback;

  window.sessionStorage.removeItem(`${SHOPIFY_APP_CONFIG_KEY}:${shop}`);
  const cacheKey = `${SHOPIFY_APP_CONFIG_KEY}:${SHOPIFY_APP_CONFIG_CACHE_VERSION}:${shop}`;
  const cached = window.sessionStorage.getItem(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `${env.apiUrl}/api/integrations/shopify/app-config`,
      {
        body: JSON.stringify({ shop }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (
      response.ok &&
      typeof payload?.api_key === "string" &&
      payload.api_key
    ) {
      window.sessionStorage.setItem(cacheKey, payload.api_key);
      return payload.api_key;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function ensureAppBridgeScript() {
  return new Promise<void>((resolve) => {
    if (window.shopify?.idToken) {
      resolve();
      return;
    }

    const existing = document.getElementById(
      APP_BRIDGE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.shopify?.idToken) {
        resolve();
        return;
      }
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = APP_BRIDGE_SCRIPT_ID;
    script.src = SHOPIFY_APP_BRIDGE_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

export function getShopifyPublicApiKey() {
  return import.meta.env.VITE_SHOPIFY_API_KEY || SHOPIFY_PUBLIC_API_KEY;
}

export async function ensureShopifyEmbeddedRuntime() {
  if (typeof window === "undefined" || !isShopifyEmbeddedSession()) return;

  const apiKey = await resolveShopifyPublicApiKey();
  if (!apiKey) return;

  ensureShopifyApiKeyMeta(apiKey);
  await ensureAppBridgeScript();
}

export function getShopifyEmbeddedError(error: unknown) {
  if (error instanceof ShopifyEmbeddedError) return error;
  return null;
}

export function openShopifyUrl(url: string) {
  if (!url || typeof window === "undefined") return;

  try {
    window.top?.location.assign(url);
  } catch {
    window.location.assign(url);
  }
}

export function initializeShopifyEmbeddedSession() {
  if (typeof window === "undefined" || !isShopifyEmbeddedSession()) return;

  void resolveShopifyPublicApiKey().then((apiKey) => {
    if (!apiKey) return;
    ensureShopifyApiKeyMeta(apiKey);
    void ensureAppBridgeScript().then(() => {
      void getShopifySessionToken().then(pingShopifySessionToken);
    });
  });

  let attempts = 0;
  const refreshToken = () => {
    void getShopifySessionToken().then(pingShopifySessionToken);
    attempts += 1;
    if (!window.shopify?.idToken && attempts < 20) {
      window.setTimeout(refreshToken, 250);
    }
  };

  refreshToken();
  window.setInterval(() => {
    void getShopifySessionToken().then(pingShopifySessionToken);
  }, 50_000);
}
