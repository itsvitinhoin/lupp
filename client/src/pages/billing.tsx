import { formatBRL } from "@/lib/utils";
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { PricingCard } from "@/components/shared/PricingCard";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PLAN_LIMITS } from "@/lib/constants";
import { isApiConfigured } from "@/lib/env";
import { billingService } from "@/services/billing.service";
import { useCurrentStore } from "@/hooks/useStore";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type {
  BillingEventSummary,
  PlanId,
  UsageSnapshot,
} from "@/types/billing";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  MousePointerClick,
  Share2,
  ShoppingCart,
  XCircle,
} from "lucide-react";

type BillingPlan = {
  id: PlanId;
  features: string[];
  isPopular?: boolean;
};

type UsageItem = {
  chartLabel: string;
  label: string;
  limit: number;
  unit?: string;
  unlimited?: boolean;
  value: number;
};

const plans: BillingPlan[] = [
  {
    id: "start",
    features: ["Até 100 vídeos", "5.000 views", "1 widget ativo"],
  },
  {
    id: "growth",
    features: [
      "Até 300 vídeos",
      "20.000 views",
      "5 widgets ativos",
      "Analytics avançado",
    ],
  },
  {
    id: "pro",
    features: [
      "Até 1.000 vídeos",
      "60.000 views",
      "Widgets ilimitados",
      "Suporte prioritário",
    ],
    isPopular: true,
  },
  {
    id: "scale",
    features: [
      "Até 5.000 vídeos",
      "150.000 views",
      "Widgets ilimitados",
      "API de integração",
    ],
  },
];

function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLAN_LIMITS;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}


function formatDate(value?: string | null) {
  if (!value) return "Ainda não definida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function usagePercent(value: number, limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}

function usageLabel(item: UsageItem) {
  const limitLabel = item.unlimited
    ? "Ilimitado"
    : `${formatNumber(item.limit)}${item.unit ?? ""}`;
  return `${formatNumber(item.value)} / ${limitLabel}`;
}

function getUsageItems(planId: PlanId, usage: UsageSnapshot): UsageItem[] {
  const limits = PLAN_LIMITS[planId];
  return [
    {
      chartLabel: "Views",
      label: "Views do mês",
      limit: limits.viewLimit,
      value: usage.monthViews,
    },
    {
      chartLabel: "Vídeos",
      label: "Vídeos ativos",
      limit: limits.videoLimit,
      value: usage.activeVideos,
    },
    {
      chartLabel: "Widgets",
      label: "Widgets ativos",
      limit: limits.widgetLimit,
      unlimited: limits.widgetLimit >= 999,
      value: usage.activeWidgets,
    },
  ];
}

export default function Billing() {
  const { store } = useCurrentStore();
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkoutPlan, setCheckoutPlan] = React.useState<BillingPlan | null>(
    null,
  );
  const [checkoutSucceeded, setCheckoutSucceeded] = React.useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = React.useState(false);
  const [isChangingPlan, setIsChangingPlan] = React.useState<PlanId | null>(
    null,
  );
  const [isCancelingSubscription, setIsCancelingSubscription] =
    React.useState(false);
  const [isLoadingPostalCode, setIsLoadingPostalCode] = React.useState(false);
  const [customerName, setCustomerName] = React.useState("");
  const [customerEmail, setCustomerEmail] = React.useState("");
  const [customerDocument, setCustomerDocument] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerPostalCode, setCustomerPostalCode] = React.useState("");
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [customerAddressNumber, setCustomerAddressNumber] = React.useState("");
  const [customerComplement, setCustomerComplement] = React.useState("");
  const [customerProvince, setCustomerProvince] = React.useState("");
  const [customerCity, setCustomerCity] = React.useState("");
  const [customerState, setCustomerState] = React.useState("");
  const [cardHolderName, setCardHolderName] = React.useState("");
  const [cardNumber, setCardNumber] = React.useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = React.useState("");
  const [cardExpiryYear, setCardExpiryYear] = React.useState("");
  const [cardCcv, setCardCcv] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [appliedCouponCode, setAppliedCouponCode] = React.useState("");
  const [isCheckingCoupon, setIsCheckingCoupon] = React.useState(false);

  const subscriptionQuery = useQuery({
    queryKey: ["billing-subscription", store?.id],
    queryFn: () => billingService.getCurrentSubscription(store!.id),
    enabled: isApiConfigured && Boolean(store?.id),
  });
  // Every billing mutation refreshes the same three caches.
  const refreshBillingCaches = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["billing-subscription", store?.id] }),
      queryClient.invalidateQueries({ queryKey: ["billing-usage", store?.id] }),
      queryClient.invalidateQueries({ queryKey: ["stores"] }),
    ]);

  const usageQuery = useQuery({
    queryKey: ["billing-usage", store?.id],
    queryFn: () => billingService.getUsage(store!.id),
    enabled: isApiConfigured && Boolean(store?.id),
  });
  const trendQuery = useQuery({
    queryKey: ["billing-usage-trend", store?.id],
    queryFn: () => billingService.getUsageTrend(store!.id, 30),
    enabled: isApiConfigured && Boolean(store?.id),
  });
  const summaryQuery = useQuery({
    queryKey: ["billing-event-summary", store?.id],
    queryFn: () => billingService.getEventSummary(store!.id),
    enabled: isApiConfigured && Boolean(store?.id),
  });

  const subscription = subscriptionQuery.data;
  const currentPlanId = isPlanId(subscription?.plan_id)
    ? subscription.plan_id
    : isPlanId(store?.plan_id)
      ? store.plan_id
      : "start";
  const currentPlan = PLAN_LIMITS[currentPlanId];
  const access = billingService.getAccessStatus(subscription, store);
  const usage = usageQuery.data ?? {
    activeVideos: 0,
    activeWidgets: 0,
    monthViews: 0,
  };
  const summary: BillingEventSummary = summaryQuery.data ?? {
    addToCart: 0,
    productClicks: 0,
    shares: 0,
    views: 0,
  };
  const trend = trendQuery.data ?? [];
  const hasTrendData = trend.some(
    (point) =>
      point.views > 0 ||
      point.productClicks > 0 ||
      point.addToCart > 0 ||
      point.shares > 0,
  );
  const usageItems = getUsageItems(currentPlanId, usage);
  const nearLimitItem = usageItems.find(
    (item) => !item.unlimited && usagePercent(item.value, item.limit) >= 80,
  );
  const usageLimitChart = usageItems.map((item) => ({
    label: item.chartLabel,
    percent: item.unlimited ? 0 : usagePercent(item.value, item.limit),
    usage: item.value,
    limit: item.limit,
    unlimited: Boolean(item.unlimited),
  }));
  const isLoading =
    subscriptionQuery.isLoading ||
    usageQuery.isLoading ||
    trendQuery.isLoading ||
    summaryQuery.isLoading;
  const eventBreakdown = [
    { label: "Views", value: summary.views },
    { label: "Cliques", value: summary.productClicks },
    { label: "Carrinho", value: summary.addToCart },
    { label: "Shares", value: summary.shares },
  ];
  const conversionRate =
    summary.views > 0 ? (summary.productClicks / summary.views) * 100 : 0;
  const hasProviderSubscription = Boolean(
    subscription?.provider_subscription_id,
  );
  const canCancelSubscription =
    hasProviderSubscription &&
    access.isPaid &&
    !access.isCanceling &&
    ["active", "pending", "past_due"].includes(subscription?.status ?? "");

  React.useEffect(() => {
    setCustomerName((current) => current || profile?.name || "");
    setCustomerEmail(
      (current) => current || profile?.email || user?.email || "",
    );
    setCardHolderName((current) => current || profile?.name || "");
  }, [profile?.email, profile?.name, user?.email]);

  React.useEffect(() => {
    const postalCode = onlyDigits(customerPostalCode);
    if (postalCode.length !== 8) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoadingPostalCode(true);
      fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("cep_request_failed");
          return response.json() as Promise<{
            bairro?: string;
            erro?: boolean;
            localidade?: string;
            logradouro?: string;
            uf?: string;
          }>;
        })
        .then((address) => {
          if (address.erro) {
            toast({
              title: "CEP não encontrado",
              description: "Confira o CEP e tente novamente.",
            });
            return;
          }
          if (address.logradouro) setCustomerAddress(address.logradouro);
          if (address.bairro) setCustomerProvince(address.bairro);
          if (address.localidade) setCustomerCity(address.localidade);
          if (address.uf) setCustomerState(address.uf);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          toast({
            title: "Não foi possível buscar o CEP",
            description: "Preencha o endereço manualmente.",
          });
        })
        .finally(() => setIsLoadingPostalCode(false));
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [customerPostalCode, toast]);

  const openCheckout = (plan: BillingPlan) => {
    setCheckoutPlan(plan);
    setCheckoutSucceeded(false);
    setAppliedCouponCode("");
    setCouponCode("");
  };

  const changeTrialPlan = async (plan: BillingPlan) => {
    if (!store) return;
    const targetPlan = PLAN_LIMITS[plan.id];
    const message = `Liberar o plano ${targetPlan.name} durante o teste gratuito? Não haverá cobrança agora.`;

    if (!window.confirm(message)) return;

    try {
      setIsChangingPlan(plan.id);
      await billingService.changeTrialPlan({
        planId: plan.id,
        storeId: store.id,
      });
      toast({
        title: "Plano liberado no teste",
        description: `Você pode usar os recursos do plano ${targetPlan.name} até o fim do trial.`,
      });
      await refreshBillingCaches();
    } catch (error) {
      toast({
        title: "Não foi possível liberar o plano",
        description:
          error instanceof Error
            ? error.message
            : "Confira o teste gratuito e tente novamente.",
      });
    } finally {
      setIsChangingPlan(null);
    }
  };

  const changePlan = async (plan: BillingPlan) => {
    if (!store) return;
    const targetPlan = PLAN_LIMITS[plan.id];
    const isDowngrade = targetPlan.priceMonthly < currentPlan.priceMonthly;
    const message = isDowngrade
      ? `Confirmar downgrade para o plano ${targetPlan.name}?`
      : `Confirmar mudança para o plano ${targetPlan.name}?`;

    if (!window.confirm(message)) return;

    try {
      setIsChangingPlan(plan.id);
      await billingService.changeSubscriptionPlan({
        planId: plan.id,
        storeId: store.id,
      });
      toast({
        title: isDowngrade ? "Downgrade realizado" : "Plano alterado",
        description: `A assinatura agora está no plano ${targetPlan.name}.`,
      });
      await refreshBillingCaches();
    } catch (error) {
      toast({
        title: "Não foi possível alterar o plano",
        description:
          error instanceof Error
            ? error.message
            : "Confira a assinatura e tente novamente.",
      });
    } finally {
      setIsChangingPlan(null);
    }
  };

  const selectPlan = (plan: BillingPlan) => {
    const canReuseProviderSubscription =
      subscription?.provider_subscription_id &&
      ["active", "pending", "past_due"].includes(subscription.status);

    if (
      access.isTrialing &&
      !access.isTrialExpired &&
      !subscription?.provider_subscription_id
    ) {
      void changeTrialPlan(plan);
      return;
    }

    if (canReuseProviderSubscription) {
      void changePlan(plan);
      return;
    }
    openCheckout(plan);
  };

  const cancelSubscription = async () => {
    if (!store) return;
    const accessLabel = formatDate(subscription?.current_period_end);
    const confirmed = window.confirm(
      `Cancelar a assinatura da Luup? Você não terá novas cobranças e a loja continua com acesso até ${accessLabel}.`,
    );
    if (!confirmed) return;

    try {
      setIsCancelingSubscription(true);
      const result = await billingService.cancelSubscription({
        storeId: store.id,
      });
      toast({
        title: "Assinatura cancelada",
        description: `A Luup continua ativa até ${formatDate(result.access_until)}.`,
      });
      await refreshBillingCaches();
    } catch (error) {
      toast({
        title: "Não foi possível cancelar",
        description:
          error instanceof Error
            ? error.message
            : "Confira a assinatura e tente novamente.",
      });
    } finally {
      setIsCancelingSubscription(false);
    }
  };

  const checkoutDiscountQuery = useQuery({
    queryKey: ["billing-coupon", appliedCouponCode],
    queryFn: () => billingService.validateCoupon(appliedCouponCode),
    enabled: Boolean(appliedCouponCode),
  });
  const checkoutDiscount = checkoutPlan
    ? billingService.calculateDiscount(
        checkoutPlan.id,
        checkoutDiscountQuery.data ?? null,
      )
    : null;

  const applyCoupon = async () => {
    const nextCode = couponCode.trim().toUpperCase();
    if (!nextCode) return;
    try {
      setIsCheckingCoupon(true);
      const coupon = await billingService.validateCoupon(nextCode);
      if (!coupon) {
        setAppliedCouponCode("");
        toast({
          title: "Cupom inválido",
          description: "Confira o código e tente novamente.",
        });
        return;
      }
      setAppliedCouponCode(coupon.code);
      toast({
        title: "Cupom aplicado",
        description: coupon.description || coupon.name || coupon.code,
      });
    } catch (error) {
      toast({
        title: "Não foi possível validar o cupom",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setIsCheckingCoupon(false);
    }
  };

  const startCheckout = async () => {
    if (!store || !checkoutPlan) return;
    try {
      setIsStartingCheckout(true);
      await billingService.startLuupSubscription({
        card: {
          ccv: cardCcv,
          expiryMonth: cardExpiryMonth,
          expiryYear: cardExpiryYear,
          holderName: cardHolderName,
          number: cardNumber,
        },
        couponCode: appliedCouponCode,
        customer: {
          address: customerAddress,
          addressNumber: customerAddressNumber,
          city: customerCity,
          complement: customerComplement,
          cpfCnpj: customerDocument,
          email: customerEmail,
          name: customerName,
          phone: customerPhone,
          postalCode: customerPostalCode,
          province: customerProvince,
          state: customerState,
        },
        planId: checkoutPlan.id,
        storeId: store.id,
      });
      setCheckoutSucceeded(true);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["billing-subscription", store.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["billing-usage", store.id],
        }),
      ]);
    } catch (error) {
      toast({
        title: "Não foi possível criar a assinatura",
        description:
          error instanceof Error
            ? error.message
            : "Confira os dados e tente novamente.",
      });
    } finally {
      setIsStartingCheckout(false);
    }
  };

  return (
    <AppLayout title="Planos e Assinatura">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">
          Assinatura Atual
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Gerencie o plano, acompanhe uso real e ajuste sua assinatura.
        </p>
      </div>

      <div className="mb-10 grid gap-6 lg:grid-cols-3">
        <Card className="border-primary/20 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-2 inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {access.isTrialing && !access.isPaid
                ? "Período teste"
                : "Plano atual"}
            </div>
            <CardTitle className="text-2xl">{currentPlan.name}</CardTitle>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {formatBRL(currentPlan.priceMonthly)}
              <span className="text-sm font-normal text-slate-500">/mês</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <span>Status</span>
              <span className="font-semibold capitalize text-slate-950">
                {access.isTrialExpired
                  ? "Teste expirado"
                  : access.isTrialing
                    ? "Teste gratuito"
                    : (subscription?.status ?? "Sem assinatura")}
              </span>
            </div>
            {access.isTrialing && (
              <div className="flex justify-between gap-4">
                <span>Tempo restante</span>
                <span className="font-semibold text-slate-950">
                  {access.isTrialExpired
                    ? "Encerrado"
                    : access.daysLeft > 1
                      ? `${access.daysLeft} dias`
                      : `${Math.max(access.hoursLeft, 1)} horas`}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span>Ciclo de faturamento</span>
              <span className="font-semibold text-slate-950">Mensal</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>
                {access.isCanceling
                  ? "Acesso até"
                  : access.isTrialing
                    ? "Fim do teste"
                    : "Próxima cobrança"}
              </span>
              <span className="font-semibold text-slate-950">
                {formatDate(access.accessEndsAt)}
              </span>
            </div>
            {canCancelSubscription && (
              <button
                type="button"
                onClick={() => void cancelSubscription()}
                disabled={isCancelingSubscription}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                {isCancelingSubscription
                  ? "Cancelando..."
                  : "Cancelar assinatura"}
              </button>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Uso do Plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {usageItems.map((item) => {
              const progress = usagePercent(item.value, item.limit);
              const nearLimit = !item.unlimited && progress >= 80;
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="font-medium text-slate-600">
                      {item.label}
                    </span>
                    <span
                      className={`font-semibold ${
                        nearLimit ? "text-amber-600" : "text-slate-950"
                      }`}
                    >
                      {usageLabel(item)}
                      {!item.unlimited ? ` (${progress}%)` : ""}
                    </span>
                  </div>
                  {item.unlimited ? (
                    <div className="flex h-2 items-center rounded-full bg-slate-100">
                      <div className="h-2 w-full rounded-full bg-slate-200" />
                    </div>
                  ) : (
                    <Progress
                      value={progress}
                      className="h-2 bg-slate-100"
                      indicatorClassName={
                        nearLimit ? "bg-amber-500" : "bg-primary"
                      }
                    />
                  )}
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Consumo dos limites
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Percentual usado no plano {currentPlan.name}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  Ciclo mensal
                </span>
              </div>
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={usageLimitChart}
                    margin={{ left: -20, right: 8, top: 8 }}
                  >
                    <CartesianGrid
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      fontSize={11}
                      stroke="#64748B"
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, 100]}
                      fontSize={11}
                      stroke="#64748B"
                      tickFormatter={(value) => `${value}%`}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#E2E8F0",
                        borderRadius: 8,
                      }}
                      formatter={(value: number, _name: string, entry) => {
                        const payload =
                          entry.payload as (typeof usageLimitChart)[number];
                        if (payload.unlimited) {
                          return [
                            `${formatNumber(payload.usage)} / Ilimitado`,
                            "Uso",
                          ];
                        }
                        return [
                          `${formatNumber(payload.usage)} / ${formatNumber(payload.limit)} (${Number(value)}%)`,
                          "Uso",
                        ];
                      }}
                    />
                    <Bar
                      dataKey="percent"
                      fill="#006BFF"
                      name="Uso"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {nearLimitItem && (
        <Alert className="mb-8 border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 stroke-amber-600" />
          <AlertTitle>Atenção ao limite</AlertTitle>
          <AlertDescription className="text-amber-800">
            {nearLimitItem.label} está em{" "}
            {usagePercent(nearLimitItem.value, nearLimitItem.limit)}% do limite
            do plano {currentPlan.name}. Faça upgrade para continuar crescendo
            sem travas.
          </AlertDescription>
        </Alert>
      )}

      {access.isTrialing &&
        !access.isTrialExpired &&
        !hasProviderSubscription && (
          <Alert className="mb-8 border-primary/20 bg-primary/5 text-primary">
            <CalendarClock className="h-4 w-4 stroke-primary" />
            <AlertTitle>Teste qualquer plano sem cobrança</AlertTitle>
            <AlertDescription className="text-primary/90">
              Durante os 7 dias gratuitos, você pode liberar Growth, Pro ou
              Scale para testar recursos e limites maiores. A cobrança só começa
              quando você cadastrar o cartão e assinar um plano.
            </AlertDescription>
          </Alert>
        )}

      {access.isCanceling && (
        <Alert className="mb-8 border-amber-200 bg-amber-50 text-amber-900">
          <CalendarClock className="h-4 w-4 stroke-amber-600" />
          <AlertTitle>Assinatura cancelada no fim do ciclo</AlertTitle>
          <AlertDescription className="text-amber-800">
            A Luup permanece ativa até {formatDate(access.accessEndsAt)}. Depois
            dessa data, os vídeos e widgets deixam de aparecer até uma nova
            assinatura ser ativada.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-10 grid gap-6 lg:grid-cols-3">
        <Card className="bg-white shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Uso real dos últimos 30 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ bottom: 4, left: 0, right: 12, top: 8 }}
                >
                  <CartesianGrid
                    stroke="#E2E8F0"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    fontSize={12}
                    stroke="#64748B"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={12}
                    stroke="#64748B"
                    tickFormatter={(value) => formatNumber(Number(value))}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#E2E8F0",
                      borderRadius: 8,
                      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                    }}
                    formatter={(value: number, name: string) => [
                      formatNumber(Number(value)),
                      name,
                    ]}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <Area
                    dataKey="views"
                    fill="#006BFF"
                    fillOpacity={0.14}
                    name="Views"
                    stroke="#006BFF"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Area
                    dataKey="productClicks"
                    fill="#10B981"
                    fillOpacity={0.1}
                    name="Cliques em produto"
                    stroke="#10B981"
                    strokeWidth={2}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {!hasTrendData && !isLoading && (
              <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Ainda não há eventos suficientes neste período. Assim que os
                vídeos forem vistos, o gráfico passa a mostrar os dados reais.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Eventos do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <BarChart3 className="mb-2 h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase text-slate-500">
                  CTR
                </p>
                <p className="text-xl font-bold text-slate-950">
                  {conversionRate.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <MousePointerClick className="mb-2 h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Cliques
                </p>
                <p className="text-xl font-bold text-slate-950">
                  {formatNumber(summary.productClicks)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <ShoppingCart className="mb-2 h-4 w-4 text-emerald-500" />
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Carrinho
                </p>
                <p className="text-xl font-bold text-slate-950">
                  {formatNumber(summary.addToCart)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <Share2 className="mb-2 h-4 w-4 text-sky-500" />
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Shares
                </p>
                <p className="text-xl font-bold text-slate-950">
                  {formatNumber(summary.shares)}
                </p>
              </div>
            </div>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={eventBreakdown}
                  margin={{ left: -20, right: 8 }}
                >
                  <CartesianGrid
                    stroke="#E2E8F0"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    fontSize={11}
                    stroke="#64748B"
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={11}
                    stroke="#64748B"
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#E2E8F0",
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => formatNumber(Number(value))}
                  />
                  <Bar
                    dataKey="value"
                    fill="#006BFF"
                    name="Eventos"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <section>
        <h3 className="mb-6 text-xl font-bold text-slate-950">
          Mudar de Plano
        </h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const selected = plan.id === currentPlanId;
            const isDowngrade =
              PLAN_LIMITS[plan.id].priceMonthly < currentPlan.priceMonthly;
            const isPlanChanging = isChangingPlan === plan.id;
            return (
              <PricingCard
                key={plan.id}
                name={PLAN_LIMITS[plan.id].name}
                price={PLAN_LIMITS[plan.id].priceMonthly}
                features={plan.features}
                selected={selected}
                isPopular={plan.isPopular}
                ctaText={
                  selected
                    ? "Plano Atual"
                    : isPlanChanging
                      ? "Alterando..."
                      : access.isTrialing && !access.isTrialExpired
                        ? "Testar no trial"
                        : access.isPaid
                          ? isDowngrade
                            ? "Fazer downgrade"
                            : "Fazer upgrade"
                          : "Assinar plano"
                }
                onSelect={
                  selected || isPlanChanging
                    ? undefined
                    : () => selectPlan(plan)
                }
              />
            );
          })}
        </div>
      </section>

      <Dialog
        open={Boolean(checkoutPlan)}
        onOpenChange={(open) => {
          if (!open) {
            setCheckoutPlan(null);
            setCheckoutSucceeded(false);
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-hidden border-slate-200 bg-white p-0 text-slate-950">
          <DialogHeader className="border-b border-slate-100 p-6 pb-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>
                  Assinar plano{" "}
                  {checkoutPlan ? PLAN_LIMITS[checkoutPlan.id].name : ""}
                </DialogTitle>
                <DialogDescription>
                  Checkout Luup seguro para ativar sua assinatura.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {checkoutSucceeded ? (
            <div className="grid gap-4 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950">
                  Assinatura criada
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Estamos aguardando a confirmação automática do pagamento para
                  ativar o plano na loja.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(null);
                  setCheckoutSucceeded(false);
                }}
                className="mx-auto mt-2 h-11 rounded-md bg-primary px-8 text-sm font-bold text-white"
              >
                Voltar para planos
              </button>
            </div>
          ) : (
            <div className="grid max-h-[72dvh] gap-4 overflow-y-auto p-6">
              <div className="rounded-md border border-primary/15 bg-primary/5 p-4 text-sm text-slate-600">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <strong className="text-slate-950">
                      {checkoutPlan ? PLAN_LIMITS[checkoutPlan.id].name : ""}
                    </strong>{" "}
                    por{" "}
                    <strong className="text-slate-950">
                      {checkoutPlan
                        ? formatBRL(
                            checkoutDiscount?.finalPrice ??
                              PLAN_LIMITS[checkoutPlan.id].priceMonthly,
                          )
                        : ""}
                      /mês
                    </strong>
                  </div>
                  {checkoutDiscount && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      Cupom {checkoutDiscount.code} aplicado
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-4">
                <Label htmlFor="luup-coupon">Cupom de desconto</Label>
                <div className="flex gap-2">
                  <Input
                    id="luup-coupon"
                    value={couponCode}
                    onChange={(event) =>
                      setCouponCode(event.target.value.toUpperCase())
                    }
                    placeholder="Digite seu cupom"
                  />
                  <button
                    type="button"
                    onClick={() => void applyCoupon()}
                    disabled={isCheckingCoupon || !couponCode.trim()}
                    className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 disabled:opacity-50"
                  >
                    {isCheckingCoupon ? "..." : "Aplicar"}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="luup-name">Nome/Razão social</Label>
                  <Input
                    id="luup-name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Nome do responsável"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-email">E-mail financeiro</Label>
                  <Input
                    id="luup-email"
                    type="email"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="financeiro@loja.com.br"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-document">CPF/CNPJ</Label>
                  <Input
                    id="luup-document"
                    value={customerDocument}
                    onChange={(event) =>
                      setCustomerDocument(event.target.value)
                    }
                    placeholder="Somente números"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-phone">Telefone</Label>
                  <Input
                    id="luup-phone"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="DDD + número"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="luup-postal-code">CEP</Label>
                  <Input
                    id="luup-postal-code"
                    value={customerPostalCode}
                    onChange={(event) =>
                      setCustomerPostalCode(event.target.value)
                    }
                    placeholder="Somente números"
                  />
                  {isLoadingPostalCode && (
                    <p className="text-xs font-medium text-primary">
                      Buscando CEP...
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-address">Endereço</Label>
                  <Input
                    id="luup-address"
                    value={customerAddress}
                    onChange={(event) => setCustomerAddress(event.target.value)}
                    placeholder="Rua, avenida..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-address-number">Número</Label>
                  <Input
                    id="luup-address-number"
                    value={customerAddressNumber}
                    onChange={(event) =>
                      setCustomerAddressNumber(event.target.value)
                    }
                    placeholder="123"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-province">Bairro</Label>
                  <Input
                    id="luup-province"
                    value={customerProvince}
                    onChange={(event) =>
                      setCustomerProvince(event.target.value)
                    }
                    placeholder="Centro"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-city">Cidade</Label>
                  <Input
                    id="luup-city"
                    value={customerCity}
                    onChange={(event) => setCustomerCity(event.target.value)}
                    placeholder="São Paulo"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="luup-state">UF</Label>
                  <Input
                    id="luup-state"
                    value={customerState}
                    onChange={(event) =>
                      setCustomerState(event.target.value.toUpperCase())
                    }
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="luup-complement">Complemento</Label>
                  <Input
                    id="luup-complement"
                    value={customerComplement}
                    onChange={(event) =>
                      setCustomerComplement(event.target.value)
                    }
                    placeholder="Sala, loja, bloco..."
                  />
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-950">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Pagamento
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="luup-card-holder">Nome no cartão</Label>
                    <Input
                      id="luup-card-holder"
                      value={cardHolderName}
                      onChange={(event) =>
                        setCardHolderName(event.target.value)
                      }
                      placeholder="Como aparece no cartão"
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="luup-card-number">Número do cartão</Label>
                    <Input
                      id="luup-card-number"
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(event) => setCardNumber(event.target.value)}
                      placeholder="0000 0000 0000 0000"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="luup-card-month">Mês</Label>
                    <Input
                      id="luup-card-month"
                      inputMode="numeric"
                      maxLength={2}
                      value={cardExpiryMonth}
                      onChange={(event) =>
                        setCardExpiryMonth(event.target.value)
                      }
                      placeholder="MM"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="luup-card-year">Ano</Label>
                    <Input
                      id="luup-card-year"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardExpiryYear}
                      onChange={(event) =>
                        setCardExpiryYear(event.target.value)
                      }
                      placeholder="AAAA"
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="luup-card-ccv">Código de segurança</Label>
                    <Input
                      id="luup-card-ccv"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardCcv}
                      onChange={(event) => setCardCcv(event.target.value)}
                      placeholder="CVV"
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void startCheckout()}
                disabled={isStartingCheckout}
                className="mt-2 h-11 rounded-md bg-primary px-5 text-sm font-bold text-white disabled:opacity-60"
              >
                {isStartingCheckout ? "Processando..." : "Confirmar assinatura"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
