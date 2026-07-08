import { requireSupabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import type { LoginPayload, SignupPayload } from "@/types/auth";

const authRedirectUrl = (path: string) => `${env.appUrl}${path}`;

export const authService = {
  async getSession() {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async getUser() {
    const { data, error } = await requireSupabase().auth.getUser();
    if (error) throw error;
    return data.user;
  },

  async signIn({ email, password }: LoginPayload) {
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signUp({ name, email, password }: SignupPayload) {
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: authRedirectUrl("/login?confirmed=1"),
      },
    });
    if (error) throw error;

    if (data.session && data.user) {
      await requireSupabase()
        .from("profiles")
        .upsert({ id: data.user.id, name, email }, { onConflict: "id" })
        .throwOnError();
    }

    return data;
  },

  async resendConfirmation(email: string) {
    const { data, error } = await requireSupabase().auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: authRedirectUrl("/login?confirmed=1"),
      },
    });
    if (error) throw error;
    return data;
  },

  async resetPassword(email: string) {
    const { data, error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl("/login?reset=1"),
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  },
};
