export type ShopifyAppConfig = {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  shop?: string;
};

type ShopifyCustomAppInput = {
  api_key?: unknown;
  api_secret?: unknown;
  client_id?: unknown;
  client_secret?: unknown;
  scope?: unknown;
  scopes?: unknown;
  secret?: unknown;
  shop?: unknown;
  shops?: unknown;
};

type ShopifyCustomApp = {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  shops: string[];
};

const DEFAULT_SCOPES = "read_products,read_inventory,read_locations";

export function normalizeShopDomain(value: unknown) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned) ? cleaned : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCustomApp(
  entry: ShopifyCustomAppInput,
  keyHint?: string,
): ShopifyCustomApp | null {
  const apiKey =
    stringValue(entry.client_id) ||
    stringValue(entry.api_key) ||
    (keyHint?.includes(".") ? "" : keyHint || "");
  const apiSecret =
    stringValue(entry.client_secret) ||
    stringValue(entry.api_secret) ||
    stringValue(entry.secret);
  const scopes =
    stringValue(entry.scopes) ||
    stringValue(entry.scope) ||
    Deno.env.get("SHOPIFY_SCOPES") ||
    DEFAULT_SCOPES;
  const shops = new Set<string>();
  const shop = normalizeShopDomain(entry.shop);
  if (shop) shops.add(shop);
  if (keyHint?.includes(".")) {
    const hintedShop = normalizeShopDomain(keyHint);
    if (hintedShop) shops.add(hintedShop);
  }
  if (Array.isArray(entry.shops)) {
    for (const item of entry.shops) {
      const normalized = normalizeShopDomain(item);
      if (normalized) shops.add(normalized);
    }
  }

  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    scopes,
    shops: Array.from(shops),
  };
}

function readCustomApps(): ShopifyCustomApp[] {
  const raw = Deno.env.get("SHOPIFY_CUSTOM_APPS_JSON") || "";
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) =>
          normalizeCustomApp((entry || {}) as ShopifyCustomAppInput),
        )
        .filter((entry): entry is ShopifyCustomApp => Boolean(entry));
    }

    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, ShopifyCustomAppInput>)
        .map(([key, entry]) =>
          normalizeCustomApp((entry || {}) as ShopifyCustomAppInput, key),
        )
        .filter((entry): entry is ShopifyCustomApp => Boolean(entry));
    }
  } catch {
    return [];
  }

  return [];
}

export function getDefaultShopifyAppConfig(): ShopifyAppConfig | null {
  const apiKey = Deno.env.get("SHOPIFY_API_KEY") || "";
  const apiSecret = Deno.env.get("SHOPIFY_API_SECRET") || "";
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    scopes: Deno.env.get("SHOPIFY_SCOPES") || DEFAULT_SCOPES,
  };
}

export function resolveShopifyAppConfig(
  params: { apiKey?: unknown; shop?: unknown } = {},
): ShopifyAppConfig | null {
  const shop = normalizeShopDomain(params.shop);
  const apiKey = stringValue(params.apiKey);
  const customApps = readCustomApps();
  const custom = customApps.find((app) => {
    if (!app) return false;
    if (apiKey && app.apiKey === apiKey) return true;
    return Boolean(shop && app.shops.includes(shop));
  });

  if (custom) {
    return {
      apiKey: custom.apiKey,
      apiSecret: custom.apiSecret,
      scopes: custom.scopes,
      shop: shop || custom.shops[0],
    };
  }

  return getDefaultShopifyAppConfig();
}
