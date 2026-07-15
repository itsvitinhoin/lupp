import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, ArrowLeft, Heart, ShoppingBag } from 'lucide-react';
import { Link } from 'wouter';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { mockVideos } from '@/data/mock';

export default function PreviewProduct() {
  const productVideos = mockVideos.filter(v => v.productName === 'Vestido Midi Azul');

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Store Header Mock */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="text-slate-500">
            <Link href="/app/widgets"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <span className="font-serif text-xl font-bold italic tracking-tight">BELLA MODA</span>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <Heart className="h-5 w-5" />
          <ShoppingBag className="h-5 w-5" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto pb-24">
        {/* Product Top Section */}
        <div className="grid md:grid-cols-2 gap-8 p-4 md:p-8">
          {/* Images Mock */}
          <div className="aspect-[3/4] bg-slate-100 rounded-lg flex items-center justify-center relative">
            <span className="text-slate-400">Imagem do Produto</span>
            
            {/* Lupp Floating Widget */}
            <Link href="/preview/feed">
              <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-black/80 backdrop-blur-md text-white p-2 pr-4 rounded-full shadow-xl cursor-pointer hover:bg-black transition-colors animate-bounce duration-[3000ms]">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                  <Play className="h-4 w-4 fill-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-tight">Veja em vídeo</span>
                  <span className="text-[10px] text-white/70 leading-tight">Como fica no corpo</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Details Mock */}
          <div className="space-y-6">
            <div>
              <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Vestidos</p>
              <h1 className="text-3xl font-bold mb-2">Vestido Midi Azul</h1>
              <p className="text-2xl font-medium text-slate-700">R$ 189,90</p>
              <p className="text-sm text-slate-500 mt-1">ou 3x de R$ 63,30 sem juros</p>
            </div>

            <div className="space-y-3">
              <p className="font-medium text-sm">Tamanho</p>
              <div className="flex gap-3">
                {['P', 'M', 'G', 'GG'].map(size => (
                  <button key={size} className="w-12 h-12 rounded-md border border-slate-300 flex items-center justify-center hover:border-slate-900 focus:ring-2 focus:ring-slate-900 transition-colors">
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full h-14 text-lg bg-black text-white hover:bg-slate-800">
              Adicionar ao carrinho
            </Button>

            <div className="prose prose-sm text-slate-600 pt-6 border-t border-slate-200">
              <p>Vestido midi em tecido leve e fluido. Possui decote em V, alças finas reguláveis e fenda lateral. Perfeito para dias quentes ou ocasiões especiais.</p>
            </div>
          </div>
        </div>

        {/* LUPP WIDGET SECTION */}
        <div className="mt-8 bg-slate-50 py-12 px-4 md:px-8 border-y border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Veja este produto em vídeo</h2>
              <div className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                Powered by <LuppLogo className="scale-50 origin-left -ml-1 -mr-2" />
              </div>
            </div>
            <Button variant="link" asChild className="text-blue-600 hidden sm:flex">
              <Link href="/preview/feed">Ver feed completo</Link>
            </Button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 snap-x" style={{ scrollbarWidth: 'none' }}>
            {productVideos.map((video, i) => (
              <Link key={video.id} href="/preview/feed">
                <div className="w-[160px] sm:w-[200px] shrink-0 snap-start cursor-pointer group relative">
                  <div className="aspect-[9/16] rounded-xl bg-slate-900 overflow-hidden relative shadow-md">
                    {/* Fake video thumbnail */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900 opacity-80 group-hover:scale-105 transition-transform duration-500"></div>
                    
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:bg-white/40 transition-colors">
                        <Play className="h-5 w-5 text-white fill-white ml-1" />
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs bg-black/40 backdrop-blur-sm px-2 py-1 rounded-md">
                      <Play className="h-3 w-3" />
                      {video.views}
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium line-clamp-2 leading-snug">{video.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
