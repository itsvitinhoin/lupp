import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { env, isApiConfigured } from '@/lib/env';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { ArrowLeft, ShoppingCart, Star } from 'lucide-react';
import { Link, useRoute } from 'wouter';

export default function TestStore() {
  const [, params] = useRoute('/test-store/:storeSlug');
  const storeSlug = params?.storeSlug ?? '';
  const widgetHostRef = React.useRef<HTMLDivElement | null>(null);
  const searchParams = new URLSearchParams(window.location.search);
  const widgetType = searchParams.get('widget') || 'floating_launcher';

  React.useEffect(() => {
    if (!widgetHostRef.current || !storeSlug || !isApiConfigured) return;

    widgetHostRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = env.widgetCdnUrl;
    script.async = true;
    script.dataset.store = storeSlug;
    script.dataset.widget = widgetType;
    script.dataset.position = 'bottom-left';
    script.dataset.label = 'Compre pelo vídeo';
    script.dataset.accentColor = '#fe2c55';
    script.dataset.backgroundColor = '#0b0b0f';
    script.dataset.textColor = '#ffffff';
    script.dataset.bubbleSize = '74';
    script.dataset.apiUrl = env.apiUrl;
    script.dataset.luppUrl = env.appUrl;
    script.dataset.productUrl = `${window.location.origin}/test-store/${storeSlug}/produto-demo`;
    widgetHostRef.current.appendChild(script);

    return () => {
      script.remove();
    };
  }, [storeSlug, widgetType]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/app/widgets"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
              <p className="text-sm font-semibold">Loja Interna Demo</p>
              <p className="text-xs text-slate-500">{storeSlug}</p>
            </div>
          </div>
          <Button variant="outline" className="border-slate-200 bg-white">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Carrinho
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[320px_minmax(0,1fr)]">
            <div className="aspect-[4/5] rounded-md bg-gradient-to-br from-slate-200 to-slate-100" />
            <div className="space-y-5">
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Produto teste</Badge>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Vestido Midi Azul</h1>
                <div className="mt-2 flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}
                  <span className="ml-2 text-sm text-slate-500">128 avaliações</span>
                </div>
              </div>
              <p className="text-4xl font-bold">R$ 189,90</p>
              <p className="max-w-xl text-slate-600">
                Página fake para validar o app da Lupp dentro de um e-commerce interno, com widget carregando vídeos reais da sua loja.
              </p>
              <div className="flex gap-3">
                <Button className="bg-slate-950 text-white hover:bg-slate-800">Comprar agora</Button>
                <Button variant="outline" className="border-slate-200 bg-white">Adicionar ao carrinho</Button>
              </div>
            </div>
          </div>

          <Card className="border-slate-200 bg-white">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2">
                <LuppLogo className="h-6" />
                <span className="text-sm font-medium text-white/80">Widget instalado via script</span>
              </div>
              <div ref={widgetHostRef} />
              {!isApiConfigured && (
                <p className="text-sm text-slate-500">Configure a API (VITE_API_URL) para carregar o widget real.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border-slate-200 bg-white">
            <CardContent className="space-y-3 p-5">
              <h2 className="text-lg font-semibold">Checklist de teste</h2>
              {[
                'O widget aparece nesta página',
                'Clique no vídeo abre o feed vertical',
                'O feed reproduz vídeos reais',
                'Eventos aparecem na API em analytics_events',
              ].map((item) => (
                <div key={item} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
