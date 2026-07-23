/**
 * Server-side port of the widget.js Upzero cart-context discovery: fetch the
 * storefront's product page HTML plus its Next.js static chunks and extract
 * the server-action ids (40-char hashes) and the numeric storefront store id
 * the cart API needs. Previously every Upzero visitor's browser did this
 * scraping; the result is store-wide, so it belongs here, cached in
 * integrations.settings.
 *
 * SSRF guard: callers must resolve the fetched URLs against the storefront
 * origin pinned in the integration/store record — never a client-supplied
 * host. discoverUpzeroCartContext enforces same-origin for every chunk URL.
 */

const CHUNK_FETCH_LIMIT = 24;
const FETCH_TIMEOUT_MS = 5_000;

// Verified against a real, current Upzero storefront bundle: action ids are
// 42 hex chars here (not 40 — Next.js's action-id length isn't a fixed,
// documented constant across versions), and the bundler emits the
// reference as `(0,ns.createServerReference)("<id>",...)` — the `(0, ns.)`
// indirection (used to call the method unbound) means a few characters
// always sit between the identifier and the opening quote, not zero.
const NAMED_ACTION_PATTERN =
  /createServerReference[^"']{0,6}["']([a-f0-9]{40,44})["'][^)]{0,200}?["']addStorefrontCartItemsBatchAction["']/gi;

const FALLBACK_ACTION_PATTERNS = [
  /"([a-f0-9]{40,44})"(?=[^]{0,900}(?:cart|carrinho|sessionId|productVariantId|storeId|items))/gi,
  /(?:cart|carrinho|sessionId|productVariantId|storeId|items)[^]{0,900}"([a-f0-9]{40,44})"/gi,
  /Next-Action["']?\s*[:=]\s*["']([a-f0-9]{40,44})["']/gi,
];

/**
 * The specific, high-confidence match: the action id bound to the exact
 * addStorefrontCartItemsBatchAction reference. Callers should search every
 * fetched source (HTML + all chunks) for this before ever accepting a
 * fallback match — a broad-heuristic hit in an early chunk must not
 * pre-empt the correctly-named action sitting in a later one.
 */
export function extractNamedUpzeroCartActionId(text: string): string | null {
  const source = String(text || "");
  NAMED_ACTION_PATTERN.lastIndex = 0;
  const match = NAMED_ACTION_PATTERN.exec(source);
  return match ? String(match[1] || "").toLowerCase() : null;
}

function extractFallbackUpzeroCartActionIds(text: string): string[] {
  const source = String(text || "");
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const pattern of FALLBACK_ACTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const id = String(match[1] || "").toLowerCase();
      if (id && !seen.has(id)) {
        seen.add(id);
        matches.push(id);
      }
    }
  }
  return matches;
}

export function extractUpzeroCartActionIds(text: string): string[] {
  const named = extractNamedUpzeroCartActionId(text);
  const fallback = extractFallbackUpzeroCartActionIds(text).filter((id) => id !== named);
  return named ? [named, ...fallback] : fallback;
}

function findStoreIdInObject(value: unknown, depth: number): number | null {
  if (!value || typeof value !== "object" || depth > 8) return null;
  const rec = value as Record<string, unknown>;

  const directKeys = [
    "storefrontStoreId",
    "storefront_store_id",
    "storeId",
    "store_id",
    "upzeroStoreId",
    "upzero_store_id",
  ];
  for (const key of directKeys) {
    const direct = Number(rec[key]);
    if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  }

  const nestedStore = rec.store || rec.storefront || rec.storefrontStore;
  if (nestedStore && typeof nestedStore === "object") {
    const nested = nestedStore as Record<string, unknown>;
    const nestedId = Number(nested.id || nested.storeId);
    if (Number.isFinite(nestedId) && nestedId > 0) return Math.trunc(nestedId);
  }

  for (const key of Object.keys(rec)) {
    const child = rec[key];
    if (!child || typeof child !== "object") continue;
    const found = findStoreIdInObject(child, depth + 1);
    if (found) return found;
  }
  return null;
}

export function extractUpzeroStorefrontStoreId(text: string): number | null {
  const source = String(text || "");
  const patterns = [
    /"storeId"\s*:\s*(\d+)/,
    /"store_id"\s*:\s*(\d+)/,
    /"storefrontStoreId"\s*:\s*(\d+)/,
    /"storefront_store_id"\s*:\s*(\d+)/,
    /"store"\s*:\s*\{[^}]{0,1200}"id"\s*:\s*(\d+)/,
    /storeId\\?":(\d+)/,
    /store_id\\?":(\d+)/,
    /storefrontStoreId\\?":(\d+)/,
    /storefront_store_id\\?":(\d+)/,
    /storeId&quot;:\s*(\d+)/,
    /store_id&quot;:\s*(\d+)/,
    /storefront_store_id&quot;:\s*(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isFinite(value) && value > 0) return Math.trunc(value);
  }

  const snippets: string[] = [];
  source.replace(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    (_, json: string) => {
      if (json) snippets.push(json);
      return "";
    },
  );
  if (!snippets.length && /^[\s\r\n]*[[{]/.test(source) && source.length < 250_000) {
    snippets.push(source);
  }
  for (const snippet of snippets) {
    try {
      const storeId = findStoreIdInObject(JSON.parse(snippet), 0);
      if (storeId) return storeId;
    } catch {
      // not JSON — keep looking
    }
  }
  return null;
}

export function extractScriptSources(html: string, pageUrl: string): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();
  String(html || "").replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (_, src: string) => {
    try {
      const resolved = new URL(src, pageUrl).href;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        sources.push(resolved);
      }
    } catch {
      // unresolvable src — skip
    }
    return "";
  });
  return sources;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml,application/javascript,*/*" },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export type UpzeroCartContext = {
  cart_action_ids: string[];
  storefront_store_id: number | null;
};

/**
 * Fetches pageUrl (must already be pinned to the storefront origin by the
 * caller) and, when needed, its /_next/static/ chunks from the SAME origin,
 * until both action ids and the storefront store id are found.
 */
export async function discoverUpzeroCartContext(pageUrl: string): Promise<UpzeroCartContext> {
  const origin = new URL(pageUrl).origin;
  const html = await fetchText(pageUrl);

  let namedActionId = extractNamedUpzeroCartActionId(html);
  let fallbackActionIds = namedActionId ? [] : extractFallbackUpzeroCartActionIds(html);
  let storefrontStoreId = extractUpzeroStorefrontStoreId(html);

  if (!namedActionId || !storefrontStoreId) {
    const chunkUrls = extractScriptSources(html, pageUrl)
      .filter((src) => src.startsWith(origin) && src.includes("/_next/static/"))
      .slice(0, CHUNK_FETCH_LIMIT);

    for (const chunkUrl of chunkUrls) {
      if (namedActionId && storefrontStoreId) break;
      const chunkText = await fetchText(chunkUrl);
      // Keep searching every chunk for the specific, correctly-named action
      // even once a fallback candidate has been seen — a low-confidence
      // heuristic match from an earlier chunk must never short-circuit the
      // search before the high-confidence match has a chance to be found.
      if (!namedActionId) {
        namedActionId = extractNamedUpzeroCartActionId(chunkText);
        if (!namedActionId && !fallbackActionIds.length) {
          fallbackActionIds = extractFallbackUpzeroCartActionIds(chunkText);
        }
      }
      if (!storefrontStoreId) storefrontStoreId = extractUpzeroStorefrontStoreId(chunkText);
    }
  }

  const actionIds = namedActionId
    ? [namedActionId, ...fallbackActionIds.filter((id) => id !== namedActionId)]
    : fallbackActionIds;

  return { cart_action_ids: actionIds, storefront_store_id: storefrontStoreId };
}
