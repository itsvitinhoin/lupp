import { env } from "@/env";

/**
 * Thin client over the Upzero API (storefront `/v1/*` and partner
 * `/external/v1/*` endpoints). Only URL/header/transport concerns live here;
 * all payload massaging stays in the handlers, like the original edge
 * functions (upzero-connect, upzero-sync-products, upzero-storefront-proxy).
 */

export const UPZERO_DEFAULT_FETCH_TIMEOUT_MS = 8_000;
export const UPZERO_DETAIL_FETCH_TIMEOUT_MS = 3_500;

export function normalizeUpzeroBaseUrl(value?: string | null) {
  const raw = String(value || env.UPZERO_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  return raw;
}

/** Headers the connect/sync functions sent on every Upzero API call. */
export function upzeroApiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

/**
 * Headers the storefront proxy sent upstream: the store's API key plus the
 * visitor's bearer token (Upzero customer session) when present.
 */
export function upzeroProxyHeaders(
  apiKey: string,
  options: { authorization?: string | null; cookie?: string | null; hasBody?: boolean } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-API-Key": apiKey,
  };
  if (options.hasBody) headers["Content-Type"] = "application/json";
  const authorization = String(options.authorization || "");
  if (/^Bearer\s+\S+/i.test(authorization)) headers.Authorization = authorization;
  // Cart continuity is a `sessionID` cookie per Upzero's storefront API docs
  // (POST /v1/cart/batch), not a body field — the widget persists the value
  // it gets back in the cart response's own `session_id` field and replays
  // it here on the next add-to-cart call.
  const cookie = String(options.cookie || "").trim();
  if (cookie) headers.Cookie = `sessionID=${encodeURIComponent(cookie)}`;
  return headers;
}

/**
 * fetch with an optional abort timeout. `timeoutMs: null` disables the
 * timeout (the storefront proxy passes requests through untimed, like the
 * original).
 */
export async function upzeroFetch(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number | null = UPZERO_DEFAULT_FETCH_TIMEOUT_MS,
) {
  if (timeoutMs === null) return fetch(input, init);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Body as JSON, `{}` when the body is missing or malformed. */
export async function readUpzeroJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * Body as JSON, `null` when empty, `{ message }` with the first 500 chars
 * when the upstream returned non-JSON (proxy pass-through semantics).
 */
export async function readUpzeroJsonOrText(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}
