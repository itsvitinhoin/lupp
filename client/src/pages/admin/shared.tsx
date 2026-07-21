import React from "react";
import { Link, useLocation } from "wouter";
import { LuppLogo } from "@/components/shared/LuppLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/services/auth.service";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, LogOut } from "lucide-react";

// Formatters live in the app-wide module; re-exported so admin pages keep a
// single import site for console-flavored helpers.
export { formatDate, formatDateTime, formatNumber, initials } from "@/lib/format";

/** Badge tone classes for store/subscription/integration statuses. */
export function statusTone(status?: string | null) {
  if (status === "active") return "bg-success-surface text-success-surface-foreground border-success-surface-border";
  if (status === "trialing") return "bg-info-surface text-info-surface-foreground border-info-surface-border";
  if (status === "paused") return "bg-warning-surface text-warning-surface-foreground border-warning-surface-border";
  if (status === "disabled" || status === "canceled") return "bg-destructive-surface text-destructive border-destructive-surface-border";
  return "bg-muted/50 text-muted-foreground border-border";
}

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/asaas", label: "Asaas" },
] as const;

function AdminNav() {
  const [location] = useLocation();

  return (
    <nav className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  adminEmail,
  children,
  onSignOut,
}: {
  adminEmail?: string;
  children: React.ReactNode;
  onSignOut?: () => Promise<void>;
}) {
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <LuppLogo className="h-9 w-auto" />
            <div className="hidden h-8 w-px bg-muted sm:block" />
            <div className="hidden lg:block">
              <p className="text-sm font-black text-foreground">
                Admin Console
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                Operação interna
              </p>
            </div>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3">
            {adminEmail && onSignOut ? (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-foreground">
                  {adminEmail}
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  Admin Luup
                </p>
              </div>
            ) : null}
            <ThemeToggle />
            {adminEmail && onSignOut ? (
              <Button
                variant="outline"
                className="gap-2"
                disabled={isSigningOut}
                onClick={async () => {
                  setIsSigningOut(true);
                  try {
                    await onSignOut();
                  } finally {
                    setIsSigningOut(false);
                  }
                }}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-full px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export function AdminLogin({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("playluup@gmail.com");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Preencha e-mail e senha admin." });
      return;
    }

    try {
      setIsSubmitting(true);
      await authService.signIn({ email: email.trim(), password });
      await onAuthenticated();
      toast({
        title: "Admin Console liberado",
        description: "Sessão interna autenticada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível entrar no Admin",
        description:
          error instanceof Error
            ? error.message
            : "Confira suas credenciais e tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <div className="grid min-h-screen-minus-header place-items-center px-4 py-10">
        <Card className="w-full max-w-md shadow-xl shadow-black/5">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-info-surface text-primary">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-foreground">
                Admin Console
              </CardTitle>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                Acesso interno da Luup para clientes, assinaturas e operação.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-email">E-mail admin</Label>
                <Input
                  id="admin-email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Senha</Label>
                <Input
                  id="admin-password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-card"
                />
              </div>
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Entrando..." : "Entrar no Admin"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

/**
 * Auth boundary shared by every /admin page: shows the loading shell while
 * the session resolves, the admin login when signed out, and renders the
 * page with the admin context once authenticated. The server still enforces
 * the admin role on every request.
 */
export function AdminGate({
  children,
}: {
  children: (context: {
    adminEmail: string;
    onSignOut: () => Promise<void>;
  }) => React.ReactNode;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  if (auth.loading) {
    return (
      <AdminShell>
        <div className="flex min-h-gate-min items-center justify-center">
          <Card>
            <CardContent className="p-6 text-sm font-semibold text-muted-foreground">
              Carregando sessão admin...
            </CardContent>
          </Card>
        </div>
      </AdminShell>
    );
  }

  if (!auth.user) {
    return (
      <AdminLogin
        onAuthenticated={async () => {
          await auth.refresh();
          await queryClient.invalidateQueries({ queryKey: ["admin-console"] });
        }}
      />
    );
  }

  return (
    <>
      {children({
        adminEmail: auth.user.email || "admin",
        onSignOut: async () => {
          await auth.signOut();
          queryClient.removeQueries({ queryKey: ["admin-console"] });
        },
      })}
    </>
  );
}
