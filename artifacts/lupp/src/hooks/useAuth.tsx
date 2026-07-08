import React from "react";
import type { AuthState } from "@/types/auth";
import { authService } from "@/services/auth.service";
import { isSupabaseConfigured } from "@/lib/env";
import { fetchShopifyEmbeddedSession, isShopifyEmbeddedSession } from "@/lib/shopify-embedded";
import { supabase } from "@/lib/supabase";

interface AuthContextValue extends AuthState {
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: isSupabaseConfigured,
    error: null,
  });

  const refresh = React.useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setState((current) => ({ ...current, loading: false }));
      return;
    }

    try {
      setState((current) => ({ ...current, loading: !current.session, error: null }));

      if (isShopifyEmbeddedSession()) {
        const embeddedSession = await fetchShopifyEmbeddedSession();
        setState({
          embeddedStore: embeddedSession.store,
          error: null,
          isShopifyEmbedded: true,
          loading: false,
          profile: embeddedSession.profile,
          session: null,
          user: embeddedSession.user,
        });
        return;
      }

      const session = await authService.getSession();
      const user = session?.user ?? null;
      let profile = null;

      if (user) {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (error) throw error;
        profile = data;
      }

      setState({ embeddedStore: null, isShopifyEmbedded: false, session, user, profile, loading: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error as Error,
      }));
    }
  }, []);

  React.useEffect(() => {
    void refresh();

    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    if (isSupabaseConfigured) {
      await authService.signOut();
    }
    setState({ user: null, session: null, profile: null, embeddedStore: null, isShopifyEmbedded: false, loading: false, error: null });
  }, []);

  return <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  return value;
}
