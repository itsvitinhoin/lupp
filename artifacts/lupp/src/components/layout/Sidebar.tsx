import React from 'react';
import { Link, useLocation } from 'wouter';
import { LuppLogo } from '../shared/LuppLogo';
import { 
  BarChart3, 
  CreditCard, 
  Film, 
  LayoutDashboard, 
  LayoutTemplate, 
  MessageSquare, 
  Package, 
  Settings, 
  Smartphone,
  Blocks,
  Link as LinkIcon
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/app' },
  { icon: Film, label: 'Vídeos', href: '/app/videos' },
  { icon: Smartphone, label: 'Feed Vertical', href: '/app/feed' },
  { icon: Blocks, label: 'Widgets', href: '/app/widgets' },
  { icon: LayoutTemplate, label: 'Páginas', href: '/app/pages' },
  { icon: Package, label: 'Produtos', href: '/app/products' },
  { icon: MessageSquare, label: 'Comentários', href: '/app/comments' },
  { icon: BarChart3, label: 'Analytics', href: '/app/analytics' },
  { icon: LinkIcon, label: 'Integrações', href: '/app/integrations' },
  { icon: CreditCard, label: 'Planos', href: '/app/billing' },
  { icon: Settings, label: 'Configurações', href: '/app/settings' },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-white/10 bg-card/50 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center px-6 border-b border-white/5">
        <Link href="/app" className="flex items-center">
          <LuppLogo />
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== '/app' && location.startsWith(item.href));
            
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3 rounded-md bg-white/5 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
            BM
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">Bella Moda</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              <span className="text-xs text-muted-foreground">Feed ativo</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
