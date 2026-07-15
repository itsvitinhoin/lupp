import React from 'react';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import { Bell, ExternalLink, Plus, Menu, LogOut, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function Header({ title }: { title: string }) {
  const [, setLocation] = useLocation();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await signOut();
      localStorage.removeItem('lupp_demo_auth');
      localStorage.removeItem('lupp_demo_store');
      toast({ title: 'Você saiu da Lupp.' });
      setLocation('/login');
    } catch (error) {
      toast({
        title: 'Não foi possível sair',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-slate-200">
            {/* Simple mobile nav re-using sidebar contents somewhat */}
            <div className="h-full flex flex-col bg-white">
               {/* We'd normally use the Sidebar component here, but need to adapt it for Sheet. For now, simple text */}
               <div className="p-6 font-bold">Menu</div>
            </div>
          </SheetContent>
        </Sheet>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="hidden text-sm font-medium text-slate-500 sm:block">Gerencie vídeos, widgets e performance da sua loja.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden h-10 min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400 xl:flex">
          <Search className="h-4 w-4" />
          Buscar...
        </div>
        <Button variant="outline" size="sm" asChild className="hidden sm:flex">
          <a href="/preview/feed" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview da loja
          </a>
        </Button>
        <Button size="sm" asChild>
          <Link href="/app/videos/new" className="flex items-center">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar vídeo
          </Link>
        </Button>
        <Button variant="ghost" size="icon" title="Notificações">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
