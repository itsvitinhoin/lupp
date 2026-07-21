import React from "react";
import { Link, useLocation } from "wouter";
import {
  CreditCard,
  Film,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  Smartphone,
  Blocks,
  Link as LinkIcon,
  ListOrdered,
  Star,
} from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useCurrentStore } from "@/hooks/useStore";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/app" },
  { icon: Film, label: "Vídeos", href: "/app/videos" },
  { icon: Smartphone, label: "Feed Vertical", href: "/app/feed" },
  { icon: Blocks, label: "Widgets", href: "/app/widgets" },
  { icon: Package, label: "Produtos", href: "/app/products" },
  { icon: MessageSquare, label: "Comentários", href: "/app/comments" },
  { icon: Star, label: "Feedbacks", href: "/app/feedbacks" },
  { icon: ListOrdered, label: "Ordenação", href: "/app/ordering" },
  { icon: LinkIcon, label: "Integrações", href: "/app/integrations" },
  { icon: CreditCard, label: "Planos", href: "/app/billing" },
  { icon: Settings, label: "Configurações", href: "/app/settings" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { store } = useCurrentStore();
  const storeName = store?.name ?? "Sua loja";
  const logoUrl = store?.logo_url;
  const initials =
    storeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LP";

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-20 items-center px-6">
        <Link href="/app" className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
              <img
                src={logoUrl}
                alt={storeName}
                className="h-full w-full object-contain"
              />
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-sm shadow-primary/20">
              {initials}
            </span>
          )}
          <span className="truncate text-xl font-black tracking-tight text-foreground">
            {storeName}
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1.5 px-4">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/app" && location.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 ring-1 ring-border">
          <span className="text-xs font-semibold text-muted-foreground">
            Tema
          </span>
          <ThemeToggle className="h-8 w-8 bg-card" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 ring-1 ring-border">
          {logoUrl ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-white">
              <img
                src={logoUrl}
                alt={storeName}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initials}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-foreground">
              {storeName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`h-2 w-2 rounded-full ${store ? "bg-success" : "bg-muted-foreground/30"}`}
              ></span>
              <span className="text-xs font-medium text-muted-foreground">
                {store ? "Conta ativa" : "Conclua o onboarding"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
