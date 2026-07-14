import React from "react";
import type { AuthState, AuthUser } from "@/types/auth";
import type { TableRow } from "@/types/database";
import { authService } from "@/services/auth.service";
import { fetchShopifyEmbeddedSession, isShopifyEmbeddedSession } from "@/lib/shopify-embedded";

interface AuthContextValue extends AuthState {
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

// Profiles were merged into the API's user record — derive the legacy profile
// shape consumers still read (billing prefill etc.) from the session user.
function profileFromUser(user: AuthUser): TableRow<"profiles"> {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    avatar_url: user.avatar_url ?? null,
    created_at: user.created_at ?? "",
    updated_at: user.created_at ?? "",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    error: null,
  });

  const refresh = React.useCallback(async () => {
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
      const profile = user ? profileFromUser(user) : null;

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
    return authService.onAuthChange(() => {
      void refresh();
    });
  }, [refresh]);

  const signOut = React.useCallback(async () => {
    await authService.signOut();
    setState({ user: null, session: null, profile: null, embeddedStore: null, isShopifyEmbedded: false, loading: false, error: null });
  }, []);

  return <AuthContext.Provider value={{ ...state, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  return value;
}
