import type { TableRow } from "./database";

/**
 * Account shape returned by the Lupp API (`GET /api/auth/me`, sign-in/up).
 * Fields are optional-loose so the Shopify embedded session's synthesized
 * user (which lacks some of them) is assignable too.
 */
export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  email_confirmed_at?: string | null;
  created_at?: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

export interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  profile: TableRow<"profiles"> | null;
  embeddedStore?: TableRow<"stores"> | null;
  isShopifyEmbedded?: boolean;
  loading: boolean;
  error: Error | null;
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
