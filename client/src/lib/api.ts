import {
  ApiError,
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client";

import { env } from "@/lib/env";
import { authService } from "@/services/auth.service";

/**
 * Points the shared REST client at the Lupp API server and teaches it to
 * attach the Lupp session token as the bearer credential. The getter
 * auto-refreshes the access token through the httpOnly refresh cookie.
 *
 * Must run before any service call — main.tsx invokes it at module scope.
 */
export function configureApiClient() {
  setBaseUrl(env.apiUrl || null);
  setAuthTokenGetter(() => authService.getValidAccessToken());
}

export type EdgeErrorPayload = Record<string, unknown> | null;

/**
 * Converts the API's machine-readable error payload into a user-facing
 * message. Returning null falls through to the default handling.
 */
export type Humanizer = (payload: EdgeErrorPayload, status: number) => string | null;

function extractPayload(error: ApiError): EdgeErrorPayload {
  return error.data && typeof error.data === "object"
    ? (error.data as Record<string, unknown>)
    : null;
}

type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type ApiOptions = { headers?: Record<string, string>; humanize?: Humanizer };

async function apiRequest<T>(
  path: string,
  init: { method: ApiMethod; body?: BodyInit; headers?: Record<string, string> },
  humanize?: Humanizer,
): Promise<T> {
  try {
    return await customFetch<T>(path, { ...init, responseType: "json" });
  } catch (error) {
    if (error instanceof ApiError) {
      const payload = extractPayload(error);
      const custom = humanize?.(payload, error.status);
      if (custom) throw new Error(custom);
      if (error.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
      const code = typeof payload?.error === "string" ? payload.error : "";
      if (code) throw new Error(code.replace(/_/g, " "));
      if (typeof payload?.message === "string") throw new Error(payload.message);
    }
    throw error;
  }
}

export async function apiGet<T>(path: string, options?: ApiOptions): Promise<T> {
  return apiRequest<T>(path, { method: "GET", headers: options?.headers }, options?.humanize);
}

export async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  options?: ApiOptions,
): Promise<T> {
  return apiRequest<T>(
    path,
    { method: "POST", body: JSON.stringify(body), headers: options?.headers },
    options?.humanize,
  );
}

export async function apiPatch<T>(
  path: string,
  body: Record<string, unknown>,
  options?: ApiOptions,
): Promise<T> {
  return apiRequest<T>(
    path,
    { method: "PATCH", body: JSON.stringify(body), headers: options?.headers },
    options?.humanize,
  );
}

export async function apiPut<T>(
  path: string,
  body: Record<string, unknown>,
  options?: ApiOptions,
): Promise<T> {
  return apiRequest<T>(
    path,
    { method: "PUT", body: JSON.stringify(body), headers: options?.headers },
    options?.humanize,
  );
}

export async function apiDelete<T>(path: string, options?: ApiOptions): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE", headers: options?.headers }, options?.humanize);
}

/**
 * Raw-bytes upload (store logos, thumbnails): the file body goes straight to
 * the API with its content type; the server reads x-file-name for the
 * extension whitelist.
 */
export async function apiUpload<T>(path: string, file: Blob & { name?: string }, options?: ApiOptions): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: "POST",
      body: file,
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": file.name ?? "",
        ...options?.headers,
      },
    },
    options?.humanize,
  );
}
