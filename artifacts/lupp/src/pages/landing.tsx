import React from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  ChevronsUp,
  CheckCircle2,
  CircleCheck,
  LinkIcon,
  LogIn,
  MessageCircle,
  MousePointerClick,
  PlayCircle,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UploadCloud,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LuppLogo } from "@/components/shared/LuppLogo";
import { PhonePreview } from "@/components/shared/PhonePreview";
import { PricingCard } from "@/components/shared/PricingCard";
import { VideoPlayerMock } from "@/components/shared/VideoPlayerMock";
import { PLAN_LIMITS } from "@/lib/constants";

const feedSectionClass =
  "h-[100svh] snap-start snap-always overflow-hidden px-4 pb-6 pt-20 sm:px-6 lg:px-8";

const immersiveSectionClass =
  "h-[100svh] snap-start snap-always overflow-hidden px-4 pb-6 pt-20 sm:px-6 lg:px-8";

const sectionInnerClass =
  "mx-auto flex h-full max-w-7xl flex-col justify-center py-4";

const platformBadges = [
  "UP Zero",
  "Nuvemshop",
  "Shopify",
  "WooCommerce",
  "VTEX",
];

const impactMetrics = [
  {
    value: "feed",
    label: "vertical dentro da loja",
    note: "o cliente assiste, descobre produtos e compra sem trocar de aba",
  },
  {
    value: "home",
    label: "com carrossel comprável",
    note: "vídeos em autoplay leve para revelar produtos antes do clique",
  },
  {
    value: "pdp",
    label: "com vídeo por produto",
    note: "a página de produto prioriza o vídeo certo e continua o feed da marca",
  },
  {
    value: "funil",
    label: "medido por eventos reais",
    note: "impressões, aberturas, views, cliques e adições ao carrinho",
  },
];

const solutionCards = [
  {
    icon: Video,
    title: "Miniaturas flutuantes",
    description:
      "Bolinhas de vídeo aparecem na home, categoria e produto sem ocupar espaço da vitrine.",
  },
  {
    icon: ShoppingBag,
    title: "Produto dentro do vídeo",
    description:
      "O cliente vê preço, variantes e CTA mantendo o contexto do feed vertical.",
  },
  {
    icon: LinkIcon,
    title: "Vínculo por produto e cor",
    description:
      "Mostre um vídeo no produto inteiro ou em variantes específicas, ideal para moda e atacado.",
  },
  {
    icon: BarChart3,
    title: "Métricas acionáveis",
    description:
      "Views, cliques, comentários, shares e intenção de compra para entender o que vende.",
  },
];

const workflowSteps = [
  {
    icon: UploadCloud,
    title: "Suba vídeos que já existem",
    description:
      "Use Reels, TikToks, provadores, reviews e conteúdos de campanha sem refazer tudo do zero.",
  },
  {
    icon: LinkIcon,
    title: "Vincule ao produto certo",
    description:
      "Associe vídeo ao produto, cor, coleção ou home para mostrar o conteúdo mais relevante.",
  },
  {
    icon: Zap,
    title: "Publique na loja inteira",
    description:
      "A Luup entrega miniaturas, feed vertical e cards compráveis com instalação simples.",
  },
  {
    icon: BarChart3,
    title: "Otimize pelo que converte",
    description:
      "Reordene vídeos, acompanhe interações e priorize conteúdos com mais intenção de compra.",
  },
];

const testimonialCards = [
  {
    quote:
      "Antes o vídeo morria no Instagram. Agora ele vira uma vitrine comprável dentro da loja.",
    role: "Moda feminina",
    metric: "+31% cliques em produto",
  },
  {
    quote:
      "O cliente entende o caimento sem chamar no WhatsApp. O vídeo tira a dúvida no momento certo.",
    role: "Atacado B2B",
    metric: "-22% dúvidas repetidas",
  },
  {
    quote:
      "A home ficou mais viva sem mudar o tema da loja. Parece social commerce, mas no nosso domínio.",
    role: "Beleza e acessórios",
    metric: "2,4x tempo na página",
  },
];

const faqItems = [
  {
    question: "A Luup tira o cliente do meu site?",
    answer:
      "Não. A experiência abre dentro da própria loja, com feed vertical, card de produto e CTA sem levar o cliente para rede social.",
  },
  {
    question: "Preciso produzir vídeos novos?",
    answer:
      "Não para começar. A melhor primeira implantação costuma usar vídeos que a marca já tem em Reels, TikTok, provadores e campanhas.",
  },
  {
    question: "Funciona para loja B2B como UP Zero?",
    answer:
      "Sim. A experiência respeita login e aprovação do cliente, então preço e compra podem aparecer apenas para compradores autorizados.",
  },
];

function LandingCtaCard({
  variant = "trial",
  compact = false,
}: {
  variant?: "trial" | "login";
  compact?: boolean;
}) {
  const isLogin = variant === "login";

  return (
    <div
      className={`rounded-2xl border border-white/20 bg-white/95 text-slate-950 shadow-2xl shadow-black/25 backdrop-blur-md ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          {isLogin ? (
            <LogIn className="h-5 w-5" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {isLogin ? "Já usa a Luup?" : "Teste grátis por 7 dias"}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-4 text-slate-500">
            {isLogin
              ? "Entre para gerenciar vídeos, produtos e métricas."
              : "Ative a experiência sem cartão e publique seu primeiro vídeo."}
          </p>
        </div>
      </div>
      <div
        className={`mt-3 grid ${isLogin ? "grid-cols-1" : "grid-cols-[1fr_auto]"} gap-2`}
      >
        <Button
          size="sm"
          className="h-10 rounded-xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700"
          asChild
        >
          <Link href={isLogin ? "/login" : "/signup"}>
            {isLogin ? "Fazer login" : "Faça o teste"}
          </Link>
        </Button>
        {!isLogin && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 rounded-xl border-slate-200 bg-white px-3 text-sm font-black text-slate-700"
            asChild
          >
            <Link href="/login">Login</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function LandingSwipeHint({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/20 px-8 text-center backdrop-blur-[1px]"
      aria-hidden="true"
    >
      <div className="flex max-w-[280px] flex-col items-center gap-3 rounded-2xl bg-slate-950/80 px-6 py-5 text-white shadow-2xl backdrop-blur-md">
        <ChevronsUp className="h-10 w-10 animate-bounce" />
        <div>
          <p className="text-base font-black">Deslize para ver mais</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/75">
            Navegue pela experiência Luup como um feed vertical de compra.
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroCommerceScene() {
  return (
    <div className="pointer-events-none absolute inset-y-24 right-0 hidden w-[58%] min-w-[620px] overflow-hidden lg:block">
      <div className="absolute right-10 top-4 h-[620px] w-[620px] rounded-[48px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/80" />
      <div className="absolute right-32 top-16 w-[420px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/80">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
              vitrine ao vivo
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              Produtos em vídeo
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            ativo
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["Conjunto Selene", "Vestido Midi", "Blazer Linho"].map(
            (product, index) => (
              <div
                key={product}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                <div
                  className={`h-24 bg-gradient-to-br ${
                    index === 0
                      ? "from-blue-200 to-slate-100"
                      : index === 1
                        ? "from-rose-200 to-slate-100"
                        : "from-emerald-200 to-slate-100"
                  }`}
                />
                <div className="p-2">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {product}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-blue-600">
                    vídeo vinculado
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="absolute right-[34rem] top-[24rem] w-56 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <MousePointerClick className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-950">+38%</p>
            <p className="text-xs font-semibold text-slate-500">
              intenção de compra
            </p>
          </div>
        </div>
      </div>

      <div className="absolute right-24 top-[13rem] w-[250px]">
        <PhonePreview className="max-w-[250px] border-[7px] shadow-2xl shadow-blue-100">
          <div className="relative h-full bg-black">
            <VideoPlayerMock gradient="from-blue-800 via-slate-900 to-black" />
            <div className="absolute left-3 top-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-950">
              Luup Feed
            </div>
            <div className="absolute right-3 top-24 flex flex-col gap-3 text-white">
              <Star className="h-5 w-5 fill-white" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
            <div className="absolute bottom-5 left-3 right-3">
              <LandingCtaCard compact />
            </div>
          </div>
        </PhonePreview>
      </div>
    </div>
  );
}

export default function Landing() {
  const [showSwipeHint, setShowSwipeHint] = React.useState(false);

  React.useEffect(() => {
    const hintKey = "luup_landing_swipe_hint_seen";
    if (window.sessionStorage.getItem(hintKey) === "1") return;
    setShowSwipeHint(true);
    window.sessionStorage.setItem(hintKey, "1");
    const timer = window.setTimeout(() => setShowSwipeHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-950 selection:bg-blue-100">
      <LandingSwipeHint visible={showSwipeHint} />
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/">
            <a aria-label="Luup Home">
              <LuppLogo />
            </a>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#solucoes"
              className="text-sm font-semibold text-slate-600 hover:text-blue-600"
            >
              Soluções
            </a>
            <a
              href="#como-funciona"
              className="text-sm font-semibold text-slate-600 hover:text-blue-600"
            >
              Como funciona
            </a>
            <a
              href="#planos"
              className="text-sm font-semibold text-slate-600 hover:text-blue-600"
            >
              Planos
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="hidden text-slate-700 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex"
              asChild
            >
              <Link href="/login">Entrar</Link>
            </Button>
            <Button
              className="bg-blue-600 px-4 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 sm:px-5"
              asChild
            >
              <Link href="/signup">
                Começar<span className="hidden sm:inline"> agora</span>
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <main
        className="h-screen snap-y snap-mandatory overflow-y-scroll overflow-x-hidden overscroll-contain scroll-smooth touch-pan-y"
        onScroll={() => setShowSwipeHint(false)}
      >
        <section className="relative isolate h-[100svh] snap-start snap-always overflow-hidden px-4 pb-6 pt-20 sm:px-6 lg:px-8">
          <HeroCommerceScene />
          <div className="mx-auto flex h-full max-w-7xl items-center py-4">
            <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                <PlayCircle className="h-4 w-4" />7 dias grátis, sem cartão
              </div>
              <h1 className="max-w-[13ch] text-5xl font-black leading-[0.95] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
                Transforme seu E-Commerce em uma Experiência de TikTok Shop.
              </h1>
              <p className="mt-6 max-w-[calc(100vw-2rem)] text-base font-medium leading-7 text-slate-600 sm:max-w-xl sm:text-xl sm:leading-8">
                Transforme vídeos de produto em um feed comprável dentro da sua
                loja, com miniatura flutuante, carrossel na Home, produto
                vinculado e CTA sem quebrar a navegação.
              </p>
              <div className="mt-8 flex max-w-full flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 w-full justify-center bg-blue-600 px-7 text-base font-bold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700 sm:w-auto"
                  asChild
                >
                  <Link href="/signup">
                    <span className="sm:hidden">Criar grátis</span>
                    <span className="hidden sm:inline">
                      Começar teste grátis
                    </span>
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full justify-center border-slate-300 bg-white px-7 text-base font-bold text-slate-800 hover:bg-slate-50 sm:w-auto"
                  asChild
                >
                  <a href="#demo">Ver como funciona</a>
                </Button>
              </div>

              <div className="mt-8 grid max-w-[calc(100vw-2rem)] grid-cols-3 gap-2 border-y border-slate-200 py-4 sm:max-w-xl sm:gap-4">
                <div>
                  <p className="text-2xl font-black text-slate-950">1 script</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    para ativar a experiência
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-950">3 telas</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    home, produto e feed
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-950">CDN</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    pensado para performance
                  </p>
                </div>
              </div>
              <div className="mt-8 hidden lg:hidden">
                <PhonePreview className="max-w-[245px] border-[7px] shadow-2xl shadow-blue-100">
                  <div className="relative h-full bg-black">
                    <VideoPlayerMock gradient="from-blue-800 via-slate-900 to-black" />
                    <div className="absolute left-3 top-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-950">
                      Luup Feed
                    </div>
                    <div className="absolute right-3 top-24 flex flex-col gap-3 text-white">
                      <Star className="h-5 w-5 fill-white" />
                      <MessageCircle className="h-5 w-5" />
                      <Send className="h-5 w-5" />
                    </div>
                    <div className="absolute bottom-5 left-3 right-3">
                      <LandingCtaCard compact />
                    </div>
                  </div>
                </PhonePreview>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${feedSectionClass} border-y border-slate-200 bg-slate-50`}
        >
          <div className={sectionInnerClass}>
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                integrado ao fluxo da loja
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                A Luup entra como uma camada de venda, sem tirar o cliente do
                seu e-commerce.
              </h2>
              <p className="mt-5 text-base font-medium leading-7 text-slate-600 sm:text-lg">
                O cliente descobre, assiste, escolhe e adiciona ao carrinho na
                experiência da própria loja.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {platformBadges.map((platform, index) => (
                <div
                  key={platform}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                    0{index + 1}
                  </p>
                  <p className="mt-3 text-xl font-black text-slate-950">
                    {platform}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    vídeo, produto e carrinho no mesmo fluxo.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={immersiveSectionClass}>
          <div className={sectionInnerClass}>
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                impacto esperado
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                A experiência que reduz dúvida e aproxima o cliente da compra.
              </h2>
              <p className="mt-4 text-base font-medium leading-7 text-slate-600">
                Os números abaixo são metas de performance para implantações de
                Video Commerce bem configuradas. O resultado real varia por
                tráfego, produto, qualidade do vídeo e oferta.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {impactMetrics.map((metric) => (
                <Card
                  key={metric.label}
                  className="border-slate-200 bg-white shadow-sm"
                >
                  <CardContent className="p-6">
                    <p className="text-3xl font-black text-blue-600">
                      {metric.value}
                    </p>
                    <h3 className="mt-3 text-lg font-black text-slate-950">
                      {metric.label}
                    </h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                      {metric.note}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="solucoes"
          className={`${immersiveSectionClass} border-y border-slate-200 bg-slate-50`}
        >
          <div className={sectionInnerClass}>
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                  soluções
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  Tudo que um vídeo precisa para vender, não só engajar.
                </h2>
              </div>
              <p className="text-base font-medium leading-7 text-slate-600 lg:text-lg">
                A Luup une conteúdo, produto e intenção de compra em um único
                player. O cliente vê o vídeo, entende a peça, comenta,
                compartilha e compra sem quebrar o momento.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {solutionCards.map((item) => {
                const Icon = item.icon;
                return (
                  <Card
                    key={item.title}
                    className="border-slate-200 bg-white shadow-sm"
                  >
                    <CardContent className="p-6">
                      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-black text-slate-950">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
                        {item.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="demo" className={immersiveSectionClass}>
          <div
            className={`${sectionInnerClass} grid gap-10 lg:grid-cols-2 lg:items-center`}
          >
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                experiência comprável
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                O produto aparece no momento em que o desejo acontece.
              </h2>
              <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
                Em vez de mandar o cliente procurar o produto depois, a Luup
                coloca o card de compra dentro do próprio vídeo. Menos fricção,
                mais contexto e mais confiança.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  "Feed vertical infinito com vídeos da marca",
                  "Produto prioritário na página certa",
                  "WhatsApp Share com link do produto",
                  "Preço protegido para lojas B2B quando o cliente não está aprovado",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <p className="font-semibold text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-x-10 bottom-0 h-32 rounded-[100%] bg-blue-100 blur-3xl" />
              <PhonePreview className="max-w-[310px] border-[7px] shadow-2xl shadow-blue-100">
                <div className="relative h-full bg-black">
                  <VideoPlayerMock gradient="from-sky-700 via-slate-900 to-black" />
                  <div className="absolute left-4 top-10 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950">
                    @useceleb
                  </div>
                  <div className="absolute right-4 top-24 flex flex-col items-center gap-5 text-white">
                    <button className="flex flex-col items-center gap-1">
                      <Star className="h-6 w-6 fill-white" />
                      <span className="text-[11px] font-bold">1.2k</span>
                    </button>
                    <button className="flex flex-col items-center gap-1">
                      <MessageCircle className="h-6 w-6" />
                      <span className="text-[11px] font-bold">84</span>
                    </button>
                    <button className="flex flex-col items-center gap-1">
                      <Send className="h-6 w-6" />
                      <span className="text-[11px] font-bold">Share</span>
                    </button>
                  </div>
                  <div className="absolute bottom-5 left-3 right-3">
                    <p className="mb-3 max-w-[210px] text-base font-bold leading-5 text-white">
                      Look completo para vitrine de moda feminina
                    </p>
                    <LandingCtaCard />
                  </div>
                </div>
              </PhonePreview>
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className={`${immersiveSectionClass} border-y border-slate-200 bg-slate-950 text-white`}
        >
          <div className={sectionInnerClass}>
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-300">
                como funciona
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                Da rede social para uma vitrine que mede e vende.
              </h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
                  >
                    <div className="mb-6 flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-black text-white/30">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-black">{step.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-300">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={immersiveSectionClass}>
          <div className={sectionInnerClass}>
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                  prova social
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  Mais confiança antes do clique de compra.
                </h2>
                <p className="mt-5 text-lg font-medium leading-8 text-slate-600">
                  O vídeo resolve objeções que uma foto estática não consegue:
                  tamanho, movimento, textura, caimento, combinações e uso real.
                </p>
              </div>
              <div className="grid gap-4">
                {testimonialCards.map((item) => (
                  <Card
                    key={item.role}
                    className="border-slate-200 bg-white shadow-sm"
                  >
                    <CardContent className="p-6">
                      <p className="text-lg font-bold leading-7 text-slate-900">
                        “{item.quote}”
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
                          {item.role}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">
                          {item.metric}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="planos" className={`${feedSectionClass} bg-slate-50`}>
          <div className={sectionInnerClass}>
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                  planos
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  Comece pequeno. Escale pelo que performa.
                </h2>
              </div>
              <p className="max-w-md text-sm font-semibold leading-6 text-slate-500">
                Comece com 7 dias gratuitos sem cadastrar cartão. Depois,
                escolha um plano ou use um cupom de parceiro/influenciador.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  id: "start",
                  features: ["100 vídeos", "5.000 views/mês", "1 widget"],
                },
                {
                  id: "growth",
                  features: [
                    "300 vídeos",
                    "20.000 views/mês",
                    "5 widgets",
                    "Analytics avançado",
                  ],
                  isPopular: true,
                },
                {
                  id: "pro",
                  features: [
                    "1.000 vídeos",
                    "60.000 views/mês",
                    "Widgets ilimitados",
                    "Suporte prioritário",
                  ],
                },
                {
                  id: "scale",
                  features: [
                    "5.000 vídeos",
                    "150.000 views/mês",
                    "API de integração",
                    "Gerente de conta",
                  ],
                },
              ].map((plan) => (
                <PricingCard
                  key={plan.id}
                  name={PLAN_LIMITS[plan.id as keyof typeof PLAN_LIMITS].name}
                  price={
                    PLAN_LIMITS[plan.id as keyof typeof PLAN_LIMITS]
                      .priceMonthly
                  }
                  features={plan.features}
                  isPopular={plan.isPopular}
                  ctaText={plan.isPopular ? "Testar grátis" : "Começar teste"}
                  onSelect={() => {
                    window.location.href = `/signup?plan=${plan.id}`;
                  }}
                />
              ))}
            </div>
            <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
              O teste gratuito libera a experiência completa por 7 dias. Ao fim
              do período, os vídeos deixam de aparecer na loja até a assinatura
              ser ativada.
            </p>
          </div>
        </section>

        <section className={feedSectionClass}>
          <div className={`${sectionInnerClass} grid gap-8 lg:grid-cols-3`}>
            <div className="lg:col-span-1">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                dúvidas comuns
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Feito para entrar na operação sem travar o time.
              </h2>
            </div>
            <div className="grid gap-4 lg:col-span-2">
              {faqItems.map((item) => (
                <Card
                  key={item.question}
                  className="border-slate-200 bg-white shadow-sm"
                >
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <CircleCheck className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
                      <div>
                        <h3 className="font-black text-slate-950">
                          {item.question}
                        </h3>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="h-[100svh] snap-start snap-always overflow-hidden px-4 pb-6 pt-20 sm:px-6 lg:px-8">
          <div className="mx-auto flex h-full max-w-7xl flex-col justify-between py-4">
            <div className="overflow-hidden rounded-[2rem] bg-blue-600 px-6 py-14 text-white shadow-2xl shadow-blue-600/20 sm:px-10 lg:px-14">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4" />
                    seu domínio, sua loja, sua conversão
                  </div>
                  <h2 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                    Transforme cada vídeo em um vendedor dentro do seu
                    e-commerce.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-blue-50">
                    A Luup coloca conteúdo, produto e compra no mesmo fluxo para
                    reduzir fricção e aumentar confiança no momento de decisão.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="h-12 bg-white px-7 text-base font-black text-blue-700 hover:bg-blue-50"
                  asChild
                >
                  <Link href="/signup">
                    Criar minha experiência
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
            <footer className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <LuppLogo />
                <p className="text-sm font-medium text-slate-500">
                  © 2026 Luup. Video Commerce para e-commerces que vendem com
                  conteúdo.
                </p>
                <div className="flex gap-4 text-sm font-semibold text-slate-500">
                  <Link href="/suporte" className="hover:text-blue-600">
                    Suporte
                  </Link>
                  <Link href="/privacidade" className="hover:text-blue-600">
                    Privacidade
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
