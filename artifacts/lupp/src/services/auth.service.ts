import { requireSupabase } from "@/lib/supabase";
import type { LoginPayload, SignupPayload } from "@/types/auth";

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
      options: { data: { name } },
    });
    if (error) throw error;

    if (data.user) {
      await requireSupabase()
        .from("profiles")
        .upsert({ id: data.user.id, name, email }, { onConflict: "id" })
        .throwOnError();
    }

    return data;
  },

  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  },
};
