import React from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStore } from "@/hooks/useStore";

function hasDemoAuth() {
  return Boolean(localStorage.getItem("lupp_demo_auth"));
}

function hasDemoStore() {
  return Boolean(localStorage.getItem("lupp_demo_store"));
}

function RouteLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="border-white/5 bg-card/60">
        <CardContent className="p-6 text-sm text-muted-foreground">{label}</CardContent>
      </Card>
    </div>
  );
}

export function ProtectedRoute({ children, requireStore = true }: { children: React.ReactNode; requireStore?: boolean }) {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const storesQuery = useCurrentStore();

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      if (!hasDemoAuth()) {
        setLocation("/login");
        return;
      }

      if (requireStore && !hasDemoStore()) {
        setLocation("/onboarding");
      }
      return;
    }

    if (loading) return;

    if (!user) {
      setLocation("/login");
      return;
    }

    if (requireStore && !storesQuery.isLoading && !storesQuery.store) {
      setLocation("/onboarding");
    }
  }, [loading, requireStore, setLocation, storesQuery.isLoading, storesQuery.store, user]);

  if (!isSupabaseConfigured) {
    if (!hasDemoAuth()) return <RouteLoading label="Redirecionando para login..." />;
    if (requireStore && !hasDemoStore()) return <RouteLoading label="Abrindo onboarding..." />;
    return <>{children}</>;
  }
  if (loading || (user && requireStore && storesQuery.isLoading)) return <RouteLoading />;
  if (!user) return <RouteLoading label="Redirecionando para login..." />;
  if (requireStore && !storesQuery.store) return <RouteLoading label="Abrindo onboarding..." />;

  return <>{children}</>;
}

export function AuthRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const storesQuery = useCurrentStore();

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      if (hasDemoAuth()) {
        setLocation(hasDemoStore() ? "/app" : "/onboarding");
      }
      return;
    }

    if (!isSupabaseConfigured || loading || !user || storesQuery.isLoading) return;
    setLocation(storesQuery.store ? "/app" : "/onboarding");
  }, [loading, setLocation, storesQuery.isLoading, storesQuery.store, user]);

  if (isSupabaseConfigured && (loading || (user && storesQuery.isLoading))) {
    return <RouteLoading />;
  }

  return <>{children}</>;
}
