import type { User, Session } from "@supabase/supabase-js";
import type { TableRow } from "./database";

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: TableRow<"profiles"> | null;
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
