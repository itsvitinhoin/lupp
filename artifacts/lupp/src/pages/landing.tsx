import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { LuppLogo } from '@/components/shared/LuppLogo';
import { PhonePreview } from '@/components/shared/PhonePreview';
import { VideoPlayerMock } from '@/components/shared/VideoPlayerMock';
import { Heart, MessageCircle, Share2, Bookmark, Play, Check } from 'lucide-react';
import { PricingCard } from '@/components/shared/PricingCard';

export default function Landing() {
  const [likes, setLikes] = React.useState(342);
  const [liked, setLiked] = React.useState(false);

  const handleLike = () => {
    if (liked) {
      setLikes(likes - 1);
      setLiked(false);
    } else {
      setLikes(likes + 1);
      setLiked(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <nav className="fixed left-0 right-0 top-0 z-50 flex h-20 items-center justify-between border-b border-white/5 bg-background/80 px-6 backdrop-blur-xl">
        <LuppLogo />
        <div className="hidden gap-8 md:flex">
          <a href="#recursos" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Recursos</a>
          <a href="#como-funciona" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Como Funciona</a>
          <a href="#planos" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Planos</a>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
          <Button className="shadow-lg shadow-primary/20" asChild>
            <Link href="/signup">Começar agora</Link>
          </Button>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pt-24 pb-32 lg:pt-36">
          <div className="absolute left-1/2 top-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]"></div>
          
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-16 lg:grid-cols-2 lg:gap-8 items-center">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary mb-8">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                  Lançamento 2025
                </div>
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl mb-6">
                  Transforme sua loja em um <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">feed de vídeos</span> compráveis.
                </h1>
                <p className="text-lg text-muted-foreground sm:text-xl mb-8 leading-relaxed">
                  Com a Lupp, seu e-commerce ganha uma experiência estilo TikTok/Reels, com vídeos verticais, produtos linkados, métricas de performance e instalação simples.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="h-14 px-8 text-base shadow-xl shadow-primary/20" asChild>
                    <Link href="/signup">Começar agora</Link>
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base bg-white/5 border-white/10" asChild>
                    <a href="#demo">Ver demonstração</a>
                  </Button>
                </div>
              </div>
              
              <div className="relative mx-auto w-full max-w-md lg:ml-auto perspective-1000">
                <div className="absolute -left-12 top-1/4 z-20 rounded-xl border border-white/10 bg-card/80 p-3 shadow-2xl backdrop-blur-xl animate-float">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                      <Check className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">+38% cliques</p>
                      <p className="text-xs text-muted-foreground">em produtos</p>
                    </div>
                  </div>
                </div>
                
                <div className="absolute -right-8 bottom-1/4 z-20 rounded-xl border border-white/10 bg-card/80 p-3 shadow-2xl backdrop-blur-xl animate-float" style={{ animationDelay: '1.5s' }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    <span className="text-sm font-medium">Feed ativo</span>
                  </div>
                </div>

                <div className="transform rotate-y-[-10deg] rotate-x-[5deg] scale-95 shadow-2xl">
                  <PhonePreview>
                    <div className="relative h-full w-full bg-black">
                      <VideoPlayerMock gradient="from-indigo-900 via-slate-900 to-black" />
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-20">
                        <div className="mb-2 rounded-lg bg-card/80 p-3 backdrop-blur-md border border-white/10">
                          <p className="text-sm font-bold text-white mb-1">Vestido Midi Azul</p>
                          <p className="text-sm text-primary mb-3">R$ 189,90</p>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" variant="outline">Ver produto</Button>
                            <Button size="sm" className="flex-1">Comprar</Button>
                          </div>
                        </div>
                      </div>

                      <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6">
                        <button className="flex flex-col items-center gap-1 text-white">
                          <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                            <Heart className="h-6 w-6" fill="white" />
                          </div>
                          <span className="text-xs font-bold">12k</span>
                        </button>
                        <button className="flex flex-col items-center gap-1 text-white">
                          <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                            <MessageCircle className="h-6 w-6" />
                          </div>
                          <span className="text-xs font-bold">342</span>
                        </button>
                        <button className="flex flex-col items-center gap-1 text-white">
                          <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                            <Share2 className="h-6 w-6" />
                          </div>
                          <span className="text-xs font-bold">Share</span>
                        </button>
                      </div>
                    </div>
                  </PhonePreview>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problemas */}
        <section className="border-t border-white/5 bg-slate-950/50 px-6 py-24">
          <div className="mx-auto max-w-7xl text-center">
            <h2 className="mb-16 text-3xl font-bold md:text-4xl">Sua loja ainda parece um catálogo parado?</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { title: 'Conversão baixa', desc: 'Visitantes saem sem comprar' },
                { title: 'Falta de confiança', desc: 'Fotos não mostram a realidade' },
                { title: 'Experiência chata', desc: 'Navegação monótona' },
                { title: 'Vídeos perdidos', desc: 'Reels morrem no Instagram' },
                { title: 'Zero métricas', desc: 'Não sabe se o vídeo vende' }
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-white/5 bg-card/30 p-6 backdrop-blur-sm transition-colors hover:bg-card/50">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <span className="text-xl font-bold">!</span>
                  </div>
                  <h3 className="mb-2 font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Demo */}
        <section id="demo" className="px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl mb-4">Experiência imersiva.</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Interaja com o player abaixo para ver como seus clientes irão navegar e comprar na sua loja.</p>
            </div>

            <div className="mx-auto max-w-sm">
              <PhonePreview>
                <div className="relative h-full w-full bg-black flex snap-y snap-mandatory overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  <div className="w-full h-full flex-shrink-0 snap-start relative">
                    <VideoPlayerMock gradient="from-teal-900 via-slate-900 to-black" />
                    
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 pt-32 pb-8">
                      <div className="mb-4">
                        <h3 className="text-white font-medium">@bellamoda</h3>
                        <p className="text-white/80 text-sm mt-1">Look incrível para o fim de semana ✨</p>
                      </div>
                      
                      <div className="rounded-xl bg-card/40 p-3 backdrop-blur-xl border border-white/10 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-primary/20"></div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">Conjunto Alfaiataria</p>
                          <p className="text-sm text-primary font-medium">R$ 249,90</p>
                        </div>
                        <Button size="sm" className="shrink-0 bg-white text-black hover:bg-white/90">Comprar</Button>
                      </div>
                    </div>

                    <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6">
                      <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
                        <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm transition-transform group-hover:scale-110">
                          <Heart className="h-7 w-7" fill={liked ? "#FF4D6D" : "transparent"} stroke={liked ? "#FF4D6D" : "white"} />
                        </div>
                        <span className="text-xs font-bold text-white shadow-sm">{likes}</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 text-white">
                        <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                          <MessageCircle className="h-7 w-7" />
                        </div>
                        <span className="text-xs font-bold">18</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 text-white">
                        <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                          <Bookmark className="h-7 w-7" />
                        </div>
                      </button>
                      <button className="flex flex-col items-center gap-1 text-white">
                        <div className="rounded-full bg-black/40 p-3 backdrop-blur-sm">
                          <Share2 className="h-7 w-7" />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </PhonePreview>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="planos" className="border-t border-white/5 bg-slate-950/50 px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold md:text-4xl mb-4">Planos que crescem com você</h2>
              <p className="text-lg text-muted-foreground">Sem taxas escondidas. Cancele quando quiser.</p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <PricingCard
                name="Start"
                price={149}
                features={['Até 30 vídeos', '10.000 views/mês', '1 loja conectada', 'Analytics básico']}
              />
              <PricingCard
                name="Growth"
                price={199}
                isPopular
                features={['Até 80 vídeos', '20.000 views/mês', '1 loja conectada', '5 widgets', 'Analytics avançado']}
              />
              <PricingCard
                name="Pro"
                price={299}
                features={['Até 200 vídeos', '50.000 views/mês', '3 lojas conectadas', 'Widgets ilimitados', 'Suporte prioritário']}
              />
              <PricingCard
                name="Scale"
                price={499}
                features={['Vídeos ilimitados', '150.000 views/mês', 'Lojas ilimitadas', 'API de integração', 'Gerente de conta']}
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-32 text-center">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-4xl font-bold md:text-6xl mb-6">Do scroll ao carrinho.</h2>
            <p className="text-xl text-muted-foreground mb-10">Junte-se a centenas de lojas que já aumentaram suas conversões com a Lupp.</p>
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link href="/signup">Criar minha conta grátis</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-slate-950 py-12 px-6 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-7xl flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2 opacity-50">
            <LuppLogo />
          </div>
          <p>© 2025 Lupp. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white">Termos</a>
            <a href="#" className="hover:text-white">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
