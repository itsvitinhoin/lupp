import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ExternalLink, Plus, Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar as MobileSidebar } from './Sidebar';

export function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/5 bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-white/10">
            {/* Simple mobile nav re-using sidebar contents somewhat */}
            <div className="h-full flex flex-col bg-card/50">
               {/* We'd normally use the Sidebar component here, but need to adapt it for Sheet. For now, simple text */}
               <div className="p-6 font-bold">Menu</div>
            </div>
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild className="hidden sm:flex border-white/10 hover:bg-white/5">
          <a href="/preview/feed" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview da loja
          </a>
        </Button>
        <Button size="sm" asChild className="shadow-lg shadow-primary/20">
          <Link href="/app/videos/new" className="flex items-center">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar vídeo
          </Link>
        </Button>
      </div>
    </header>
  );
}
