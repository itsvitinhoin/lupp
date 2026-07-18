import { ApiError, customFetch } from "@workspace/api-client";
import { env } from "@/lib/env";
import type { AuthSession, AuthUser, LoginPayload, SignupPayload } from "@/types/auth";

/**
 * Auth against the Lupp API server (replaces Supabase auth).
 *
 * The access JWT (15 min) lives in localStorage; the 7-day refresh JWT lives
 * in an httpOnly cookie set by the server, so every auth call runs with
 * `credentials: "include"`. `getValidAccessToken()` transparently rotates the
 * access token through `PATCH /api/auth/sessions/refresh` when it is about to
 * expire — the shared API client uses it as its bearer-token getter.
 */

const ACCESS_TOKEN_KEY = "lupp_access_token";
const EXPIRY_MARGIN_MS = 30_000;

type AuthChangeListener = () => void;
const listeners = new Set<AuthChangeListener>();

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = readStoredToken();
let refreshInFlight: Promise<string | null> | null = null;
// Whether we already tried restoring a session from the refresh cookie on
// this page load — prevents an anonymous visitor from hitting the refresh
// endpoint on every API call.
let triedCookieRestore = false;

function setAccessToken(token: string | null) {
  const changed = token !== accessToken;
  accessToken = token;
  try {
    if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode) — the in-memory token still works.
  }
  if (changed) listeners.forEach((listener) => listener());
}

function tokenExpiresAt(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(window.atob(payload)) as { exp?: number };
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Unwraps the API's `{message}` error bodies into plain Errors so pages can
 * surface them directly (login.tsx matches "Email not confirmed." to offer
 * resending the confirmation).
 */
async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  try {
    return await customFetch<T>(path, {
      ...init,
      credentials: "include",
      responseType: "json",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const message = (error.data as { message?: unknown } | null)?.message;
      if (typeof message === "string" && message) throw new Error(message);
    }
    throw error;
  }
}

/**
 * The refresh call must NOT go through customFetch: the shared client asks
 * authService for a bearer token before every request, so routing the refresh
 * itself through it re-enters getValidAccessToken -> refreshSession while
 * refreshInFlight is still unassigned, recursing synchronously until the
 * stack overflows and then storming the endpoint on unwind. Raw fetch is
 * safe — the endpoint's only credential is the httpOnly cookie.
 */
async function requestRefreshedToken(): Promise<string> {
  const response = await fetch(`${env.apiUrl}/api/auth/sessions/refresh`, {
    method: "PATCH",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Refresh failed: HTTP ${response.status}`);
  const { token } = (await response.json()) as { token?: string };
  if (!token) throw new Error("Refresh response missing token.");
  return token;
}

function refreshSession(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const token = await requestRefreshedToken();
      setAccessToken(token);
      return token;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const authService = {
  /**
   * Bearer token for API calls, auto-refreshed via the httpOnly cookie when
   * near expiry. Null when signed out.
   */
  async getValidAccessToken(): Promise<string | null> {
    if (accessToken && tokenExpiresAt(accessToken) - EXPIRY_MARGIN_MS > Date.now()) {
      return accessToken;
    }
    if (accessToken) return refreshSession();
    if (!triedCookieRestore) {
      triedCookieRestore = true;
      return refreshSession();
    }
    return null;
  },

  async getSession(): Promise<AuthSession | null> {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    try {
      const { user } = await customFetch<{ user: AuthUser }>("/api/auth/me", {
        method: "GET",
        credentials: "include",
        responseType: "json",
        headers: { authorization: `Bearer ${token}` },
      });
      return { access_token: token, user };
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        setAccessToken(null);
        return null;
      }
      throw error;
    }
  },

  async getUser(): Promise<AuthUser | null> {
    return (await this.getSession())?.user ?? null;
  },

  async signIn({ email, password }: LoginPayload) {
    const data = await authRequest<{ token: string; user: AuthUser }>(
      "/api/auth/sessions",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
    setAccessToken(data.token);
    const session: AuthSession = { access_token: data.token, user: data.user };
    return { session, user: data.user };
  },

  async signUp({ name, email, password }: SignupPayload) {
    const { user } = await authRequest<{ user: AuthUser }>("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    // Email confirmation is required — no session until the link is clicked.
    return { user, session: null as AuthSession | null };
  },

  async resendConfirmation(email: string) {
    return authRequest<{ sent: true }>("/api/auth/resend-confirmation", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(email: string) {
    return authRequest<{ sent: true }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  /** Completes a reset started from the emailed `/login?reset=1&token=` link. */
  async confirmPasswordReset(token: string, password: string) {
    return authRequest<{ reset: true }>("/api/auth/reset-password/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },

  async signOut() {
    try {
      await authRequest<null>("/api/auth/sessions", { method: "DELETE" });
    } finally {
      setAccessToken(null);
    }
  },

  /** Notifies on sign-in/sign-out/refresh; returns an unsubscribe function. */
  onAuthChange(listener: AuthChangeListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
