/**
 * Shared request/response inspection primitives for provider API clients
 * (`lib/nuvemshop`, future providers). Each client still owns its own
 * `doRequest` (URL building, auth headers and result shaping differ per
 * provider); this module only fixes the buffering cap, the timeout and the
 * inspection shape so specs can assert on the exact request a method built.
 */

export const MAX_BUFFERED = 50;

export const REQUEST_TIMEOUT_MS = 15000;

export type LastRequestSchema = {
  method: string;
  headers: Record<string, string>;
  url: string;
  timeout?: number;
  body?: unknown;
};

export type LastResponseSchema = {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
};

/** Append to a buffer, dropping the oldest entry once it exceeds the cap. */
export function pushCapped<T>(arr: T[], v: T) {
  arr.push(v);
  if (arr.length > MAX_BUFFERED) arr.shift();
}

// access_token is Asaas' API-key header; the others are standard bearer spots.
const SECRET_HEADERS = new Set(["authorization", "authentication", "access_token"]);

/** Buffered copies must never retain bearer tokens or API keys. */
export function redactHeaderSecrets(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) =>
      SECRET_HEADERS.has(key.toLowerCase()) ? [key, "<redacted>"] : [key, value],
    ),
  );
}
