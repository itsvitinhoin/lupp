import { env } from "@/env";
import {
  pushCapped,
  redactHeaderSecrets,
  REQUEST_TIMEOUT_MS,
  type LastRequestSchema,
  type LastResponseSchema,
} from "@/lib/http/request-buffer";

/**
 * Asaas HTTP core (crm-dzns client pattern, mirroring `lib/nuvemshop`).
 * Hosts and error extraction match the original asaas-* edge functions; the
 * flat helpers below predate the client classes and keep their exact
 * semantics for the billing routes built on them.
 */

export type AsaasEnvironment = "sandbox" | "production";

export function asaasApiBase(
  environment: AsaasEnvironment = env.ASAAS_ENVIRONMENT,
) {
  return environment === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

/** Hosted checkout page (create-checkout builds the redirect URL). */
export function asaasCheckoutBaseUrl(
  environment: AsaasEnvironment = env.ASAAS_ENVIRONMENT,
) {
  return environment === "sandbox"
    ? "https://sandbox.asaas.com/checkoutSession/show"
    : "https://asaas.com/checkoutSession/show";
}

/**
 * Error surface the originals used: the first `errors[].description`, then
 * `message`, then a generic code.
 */
export async function readAsaasError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    errors?: Array<{ description?: unknown }>;
    message?: unknown;
  } | null;
  if (body && Array.isArray(body.errors) && body.errors[0]?.description) {
    return String(body.errors[0].description);
  }
  if (body && typeof body.message === "string") return body.message;
  return "asaas_request_failed";
}

/** Raw call — the caller inspects response.ok/status (create-checkout). */
export async function asaasFetch(
  path: string,
  payload: Record<string, unknown>,
  method: "POST" | "PUT" = "POST",
) {
  return fetch(`${asaasApiBase()}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY ?? "",
    },
    method,
  });
}

/** JSON call that throws Error(<asaas error message>) on non-2xx, like the originals. */
export async function asaasRequest<T>(
  path: string,
  payload: Record<string, unknown>,
  method: "POST" | "PUT" = "POST",
) {
  const response = await asaasFetch(path, payload, method);

  if (!response.ok) {
    throw new Error(await readAsaasError(response));
  }

  return (await response.json()) as T;
}

/** Query-string builder that drops undefined/empty params. */
export function toQueryString(
  params: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type AsaasApiResult = {
  ok: boolean;
  status: number;
  /** Body parsed as JSON when possible, `{}` otherwise. */
  data: unknown;
  /** Raw body text (surfaced in error details). */
  text: string;
  /** Extracted Asaas error message when `ok` is false, `null` otherwise. */
  errorMessage: string | null;
};

export type BaseClientProps = {
  /** Defaults to env.ASAAS_API_KEY at request time. */
  apiKey?: string;
  /** Defaults to env.ASAAS_ENVIRONMENT at request time. */
  environment?: AsaasEnvironment;
};

function extractErrorMessage(data: unknown): string {
  const body = data as {
    errors?: Array<{ description?: unknown }>;
    message?: unknown;
  } | null;
  if (body && Array.isArray(body.errors) && body.errors[0]?.description) {
    return String(body.errors[0].description);
  }
  if (body && typeof body.message === "string") return body.message;
  return "asaas_request_failed";
}

/**
 * Shared plumbing for the resource sub-clients: Asaas `access_token` header,
 * JSON content type, request timeout, and capped `lastRequest(s)`/
 * `lastResponse(s)` inspection buffers (API key redacted). Methods return the
 * non-throwing AsaasApiResult shape — callers branch on `ok`/`status` and can
 * read `errorMessage` for the originals' error surface.
 */
export class BaseClient {
  public apiKeyOverride?: string;
  public environmentOverride?: AsaasEnvironment;

  public lastRequests: LastRequestSchema[] = [];
  public lastResponses: LastResponseSchema[] = [];
  public lastRequest?: LastRequestSchema;
  public lastResponse?: LastResponseSchema;

  constructor({ apiKey, environment }: BaseClientProps = {}) {
    this.apiKeyOverride = apiKey;
    this.environmentOverride = environment;
  }

  get environment(): AsaasEnvironment {
    return this.environmentOverride ?? env.ASAAS_ENVIRONMENT;
  }

  get apiBase() {
    return asaasApiBase(this.environment);
  }

  protected get apiKey() {
    return this.apiKeyOverride ?? env.ASAAS_API_KEY ?? "";
  }

  async doRequest(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<AsaasApiResult> {
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      access_token: this.apiKey,
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

    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: mergedHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text().catch(() => "");
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Non-JSON body; callers that care read `text`.
    }

    this.lastResponse = {
      status: response.status,
      body: data,
      headers: {},
    };
    pushCapped(this.lastResponses, this.lastResponse);

    return {
      ok: response.ok,
      status: response.status,
      data,
      text,
      errorMessage: response.ok ? null : extractErrorMessage(data),
    };
  }
}
