import { formatBRL } from "@/lib/utils";
import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardMetrics } from "@/hooks/useAnalytics";
import { useCurrentStore } from "@/hooks/useStore";
import {
  Activity,
  ArrowRight,
  CreditCard,
  DollarSign,
  Eye,
  Film,
  Lock,
  MessageCircle,
  MousePointerClick,
  PlayCircle,
  ShoppingCart,
  Star,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "wouter";
import type {
  DashboardCapabilities,
  DashboardFunnelStep,
  DashboardRankingItem,
} from "@/types/analytics";

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}


function formatPercent(value?: number | null) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatDuration(seconds?: number | null) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function defaultCapabilities(): DashboardCapabilities {
  return {
    attributionLabel: "Disponível com integração de pedidos.",
    checkoutLabel: "Checkout externo ou em breve.",
    integrationName: "Integração manual",
    provider: "manual",
    supportsAttributedOrders: false,
    supportsAttributedRevenue: false,
    supportsCartEvents: true,
    supportsInlineCheckout: false,
    supportsVariantGrid: false,
  };
}

function emptyChart() {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return {
      addToCart: 0,
      date: date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      feedOpens: 0,
      impressions: 0,
      productClicks: 0,
      revenue: 0,
      views: 0,
    };
  });
}

export default function Dashboard() {
  const { store } = useCurrentStore();
  const metricsQuery = useDashboardMetrics(store?.id);
  const metrics = metricsQuery.data;
  const capabilities = metrics?.capabilities ?? defaultCapabilities();
  const chartData = metrics?.chartData?.length ? metrics.chartData : emptyChart();
  const funnel = metrics?.funnel ?? [];
  const topVideos = metrics?.topVideos ?? [];
  const topProducts = metrics?.topProducts ?? [];

  return (
    <AppLayout title="Dashboard">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            Funil de video commerce dos últimos 30 dias
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Da bolinha ao carrinho, sem inflar conversão
          </h2>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {capabilities.integrationName}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Eye}
          label="Impressões da bolinha"
          value={formatNumber(metrics?.widgetImpressions)}
          detail="Quantas vezes a Luup apareceu na loja."
        />
        <MetricCard
          icon={PlayCircle}
          label="Aberturas do feed"
          value={formatNumber(metrics?.feedOpens)}
          detail={`${formatPercent(metrics?.feedOpenRate)} de abertura`}
        />
        <MetricCard
          icon={Film}
          label="Views de vídeo"
          value={formatNumber(metrics?.views)}
          detail="Reproduções iniciadas no feed."
        />
        <MetricCard
          icon={ShoppingCart}
          label="Adições ao carrinho"
          value={formatNumber(metrics?.addToCart)}
          detail={`${formatPercent(metrics?.cartRate)} por view`}
          tone="strong"
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={MousePointerClick}
          label="Cliques em produto"
          value={formatNumber(metrics?.productClicks)}
          detail={`${formatPercent(metrics?.productClickRate)} das views`}
        />
        <MetricCard
          icon={Users}
          label="Visitantes únicos"
          value={formatNumber(metrics?.uniqueVisitors)}
          detail={`${formatNumber(metrics?.sessions)} sessões`}
        />
        <MetricCard
          icon={Timer}
          label="Tempo médio na Luup"
          value={formatDuration(metrics?.averageFeedSessionSeconds)}
          detail="Tempo médio entre abrir e sair da experiência."
        />
        <MetricCard
          icon={CreditCard}
          label="Checkout iniciado"
          value={formatNumber(metrics?.checkoutStarted)}
          detail={capabilities.checkoutLabel}
          locked={!capabilities.supportsInlineCheckout}
        />
        <MetricCard
          icon={TrendingUp}
          label="Compras atribuídas"
          value={formatNumber(metrics?.attributedPurchases)}
          detail={capabilities.attributionLabel}
          locked={!capabilities.supportsAttributedOrders}
        />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={DollarSign}
          label="Receita atribuída"
          value={formatBRL(metrics?.attributedRevenue)}
          detail={
            capabilities.supportsAttributedRevenue
              ? "Receita de pedidos confirmados."
              : "Bloqueado nesta integração."
          }
          locked={!capabilities.supportsAttributedRevenue}
        />
        <MetricCard
          icon={Activity}
          label="Engajamento"
          value={formatPercent(metrics?.engagementRate)}
          detail="Likes, comentários e shares por view."
        />
        <MetricCard
          icon={Star}
          label="Feedback médio"
          value={
            metrics?.averageFeedbackRating
              ? metrics.averageFeedbackRating.toFixed(1)
              : "0.0"
          }
          detail="Estrelas enviadas ao fechar o vídeo."
        />
        <MetricCard
          icon={MessageCircle}
          label="Comentários pendentes"
          value={formatNumber(metrics?.pendingComments)}
          detail={`${formatNumber(metrics?.totalLikes)} likes acumulados`}
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.45fr_.95fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Performance diária</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Impressões, aberturas, views e carrinho nos últimos 30 dias.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ bottom: 5, left: 0, right: 20, top: 5 }}
                >
                  <CartesianGrid
                    stroke="#E5E7EB"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    stroke="#64748B"
                    tickMargin={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={12}
                    stroke="#64748B"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#E2E8F0",
                      borderRadius: "10px",
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                    }}
                  />
                  <Line
                    dataKey="impressions"
                    dot={false}
                    name="Impressões"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="views"
                    dot={false}
                    name="Views"
                    stroke="#176BFF"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="feedOpens"
                    dot={false}
                    name="Aberturas"
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="addToCart"
                    dot={false}
                    name="Carrinho"
                    stroke="#10B981"
                    strokeWidth={2}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <FunnelCard funnel={funnel} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RankingCard
          ctaHref="/app/videos"
          ctaLabel="Ver vídeos"
          emptyText="Crie vídeos para enxergar retenção e carrinho por peça."
          items={topVideos}
          title="Top vídeos por carrinho"
        />
        <RankingCard
          ctaHref="/app/products"
          ctaLabel="Ver produtos"
          emptyText="Vincule produtos aos vídeos para medir intenção por produto."
          items={topProducts}
          title="Top produtos adicionados"
        />
      </div>
    </AppLayout>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  locked = false,
  tone = "default",
  value,
}: {
  detail: string;
  icon: React.ElementType;
  label: string;
  locked?: boolean;
  tone?: "default" | "strong";
  value: string;
}) {
  return (
    <Card
      className={
        locked
          ? "border-slate-200 bg-slate-100 text-slate-400"
          : tone === "strong"
            ? "border-primary/25 bg-primary/5 text-slate-950"
            : "border-slate-200 bg-white text-slate-950"
      }
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className={
              locked
                ? "flex h-11 w-11 items-center justify-center rounded-md bg-white text-slate-400"
                : "flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary"
            }
          >
            {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </div>
          {locked && (
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-400">
              Em breve
            </span>
          )}
        </div>
        <p className="mt-4 text-sm font-bold text-slate-500">{label}</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight">{value}</h3>
        <p className="mt-1 min-h-[36px] text-xs font-medium leading-relaxed text-slate-500">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function FunnelCard({ funnel }: { funnel: DashboardFunnelStep[] }) {
  const maxValue = Math.max(1, ...funnel.map((step) => step.value));

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Funil da experiência</CardTitle>
        <p className="text-sm text-slate-500">
          Etapas cinzas dependem da integração da plataforma.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {funnel.map((step, index) => {
          const width = Math.max(6, Math.round((step.value / maxValue) * 100));
          return (
            <div key={step.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        step.enabled
                          ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-black text-white"
                          : "flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-400"
                      }
                    >
                      {index + 1}
                    </span>
                    <p className="truncate text-sm font-black text-slate-950">
                      {step.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {step.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-950">
                    {formatNumber(step.value)}
                  </p>
                  {step.rateFromPrevious !== null && (
                    <p className="text-xs font-bold text-slate-500">
                      {formatPercent(step.rateFromPrevious)}
                    </p>
                  )}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={
                    step.enabled
                      ? "h-full rounded-full bg-primary"
                      : "h-full rounded-full bg-slate-300"
                  }
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RankingCard({
  ctaHref,
  ctaLabel,
  emptyText,
  items,
  title,
}: {
  ctaHref: string;
  ctaLabel: string;
  emptyText: string;
  items: DashboardRankingItem[];
  title: string;
}) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>{title}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href={ctaHref}>
            {ctaLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-md border border-slate-100 p-3"
              >
                <div className="h-12 w-12 overflow-hidden rounded-md bg-slate-100">
                  {item.imageUrl ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={item.imageUrl}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <Film className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {item.label}
                  </p>
                  <p className="truncate text-xs font-medium text-slate-500">
                    {item.subtitle}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-950">
                    {formatNumber(item.addToCart)}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {formatPercent(item.rate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm font-semibold text-slate-500">{emptyText}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
