import {
  ApiError,
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
} from "@workspace/api-client-react";

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

async function apiRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: string; headers?: Record<string, string> },
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

export async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  options?: { headers?: Record<string, string>; humanize?: Humanizer },
): Promise<T> {
  return apiRequest<T>(
    path,
    { method: "POST", body: JSON.stringify(body), headers: options?.headers },
    options?.humanize,
  );
}
