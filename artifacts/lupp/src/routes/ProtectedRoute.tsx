import React from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ShopifyEmbeddedRecovery } from "@/components/shared/ShopifyEmbeddedRecovery";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStore } from "@/hooks/useStore";
import { isShopifyEmbeddedSession } from "@/lib/shopify-embedded";

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
  const { error, user, loading } = useAuth();
  const storesQuery = useCurrentStore();
  const isEmbedded = isShopifyEmbeddedSession();

  React.useEffect(() => {
    if (loading) return;

    if (!user) {
      if (isEmbedded) return;
      setLocation("/login");
      return;
    }

    if (requireStore && !storesQuery.isLoading && !storesQuery.store) {
      setLocation("/onboarding");
    }
  }, [isEmbedded, loading, requireStore, setLocation, storesQuery.isLoading, storesQuery.store, user]);

  if (isEmbedded && (loading || (user && requireStore && storesQuery.isLoading))) {
    return <ShopifyEmbeddedRecovery connecting error={error} />;
  }
  if (loading || (user && requireStore && storesQuery.isLoading)) return <RouteLoading />;
  if (!user && isEmbedded) {
    return error ? <ShopifyEmbeddedRecovery error={error} /> : <RouteLoading label="Conectando com a Shopify..." />;
  }
  if (!user) return <RouteLoading label="Redirecionando para login..." />;
  if (requireStore && !storesQuery.store) return <RouteLoading label="Abrindo onboarding..." />;

  return <>{children}</>;
}

export function AuthRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { error, user, loading } = useAuth();
  const storesQuery = useCurrentStore();
  const isEmbedded = isShopifyEmbeddedSession();

  React.useEffect(() => {
    if (loading || !user || storesQuery.isLoading) return;
    setLocation(storesQuery.store ? "/app" : "/onboarding");
  }, [loading, setLocation, storesQuery.isLoading, storesQuery.store, user]);

  if (isEmbedded && (loading || (user && storesQuery.isLoading))) {
    return <ShopifyEmbeddedRecovery connecting error={error} />;
  }

  if (loading || (user && storesQuery.isLoading)) {
    return <RouteLoading />;
  }

  if (!user && isEmbedded) {
    return error ? <ShopifyEmbeddedRecovery error={error} /> : <RouteLoading label="Conectando com a Shopify..." />;
  }

  return <>{children}</>;
}
