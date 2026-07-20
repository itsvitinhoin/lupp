import {
  pushCapped,
  redactHeaderSecrets,
  REQUEST_TIMEOUT_MS,
  type LastRequestSchema,
  type LastResponseSchema,
} from "@/lib/http/request-buffer";

/**
 * Nuvemshop/Tiendanube HTTP core. Hosts/versions match the original edge
 * functions: store/product reads on api.nuvemshop.com.br, the Scripts API on
 * api.tiendanube.com, token exchange on www.tiendanube.com.
 */
export const NUVEMSHOP_API_VERSION = "2025-03";

export function nuvemshopApiBase(externalStoreId: string) {
  return `https://api.nuvemshop.com.br/${NUVEMSHOP_API_VERSION}/${externalStoreId}`;
}

export function nuvemshopScriptsApiBase(externalStoreId: string) {
  return `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}/${externalStoreId}/scripts`;
}

export type NuvemshopApiResult = {
  ok: boolean;
  status: number;
  /** Body parsed as JSON when possible, `{}` otherwise (like the originals' `.json().catch(() => ({}))`). */
  data: unknown;
  /** Raw body text (the originals surface it in error details). */
  text: string;
  /** `Link` response header, used for product pagination. */
  linkHeader: string;
};

/**
 * Raw request helper: non-throwing on HTTP errors (callers branch on
 * `ok`/`status`); network failures and aborts still reject. Kept exported for
 * the routes that predate the client classes below.
 */
export async function nuvemshopRequest(
  url: string,
  init: {
    method?: string;
    headers: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<NuvemshopApiResult> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  const text = await response.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON body; callers that care read `text`.
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
    linkHeader: response.headers.get("link") ?? "",
  };
}

export type BaseClientProps = {
  accessToken?: string;
  userAgent?: string;
};

/**
 * Shared plumbing for the resource sub-clients: default headers (bearer token
 * when present, JSON content type, provider User-Agent), a request timeout,
 * and capped `lastRequest(s)`/`lastResponse(s)` inspection buffers that specs
 * assert against (tokens redacted).
 */
export class BaseClient {
  public token?: string;
  public userAgent?: string;

  public lastRequests: LastRequestSchema[] = [];
  public lastResponses: LastResponseSchema[] = [];
  public lastRequest?: LastRequestSchema;
  public lastResponse?: LastResponseSchema;

  constructor({ accessToken, userAgent }: BaseClientProps = {}) {
    this.token = accessToken;
    this.userAgent = userAgent;
  }

  async doRequest(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<NuvemshopApiResult> {
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(this.userAgent ? { "User-Agent": this.userAgent } : {}),
      ...headers,
    };

    this.lastRequest = {
      method: method.toUpperCase(),
      url,
      headers: redactHeaderSecrets(mergedHeaders),
      timeout: REQUEST_TIMEOUT_MS,
      body,
    };
    pushCapped(this.lastRequests, this.lastRequest);

    const result = await nuvemshopRequest(url, {
      method: method.toUpperCase(),
      headers: mergedHeaders,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    this.lastResponse = {
      status: result.status,
      body: result.data,
      headers: result.linkHeader ? { link: result.linkHeader } : {},
    };
    pushCapped(this.lastResponses, this.lastResponse);

    return result;
  }
}
