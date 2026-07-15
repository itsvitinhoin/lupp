import React from "react";
import { LuppLogo } from "@/components/shared/LuppLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/services/auth.service";
import { masterConsoleService } from "@/services/master-console.service";
import type {
  MasterConsoleAction,
  MasterConsoleStoreRow,
} from "@/types/master-console";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Building2,
  Clock3,
  DollarSign,
  Eye,
  Film,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  LockKeyhole,
  LogOut,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(Number(value || 0));
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function statusTone(status?: string | null) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "trialing") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "paused") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "disabled" || status === "canceled") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LP"
  );
}

export default function MasterConsole() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  if (auth.loading) {
    return (
      <MasterShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-6 text-sm font-semibold text-slate-500">
              Carregando sessão master...
            </CardContent>
          </Card>
        </div>
      </MasterShell>
    );
  }

  if (!auth.user) {
    return (
      <MasterLogin
        onAuthenticated={async () => {
          await auth.refresh();
          await queryClient.invalidateQueries({ queryKey: ["master-console"] });
        }}
      />
    );
  }

  return (
    <MasterDashboard
      adminEmail={auth.user.email || "admin"}
      onSignOut={async () => {
        await auth.signOut();
        queryClient.removeQueries({ queryKey: ["master-console"] });
      }}
    />
  );
}

function MasterDashboard({
  adminEmail,
  onSignOut,
}: {
  adminEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const snapshotQuery = useQuery({
    queryKey: ["master-console"],
    queryFn: () => masterConsoleService.getSnapshot(),
    retry: false,
  });

  const actionMutation = useMutation({
    mutationFn: ({
      action,
      currentTrialEndsAt,
      days,
      planId,
      storeId,
    }: {
      action: MasterConsoleAction;
      currentTrialEndsAt?: string | null;
      days?: number;
      planId?: string;
      storeId: string;
    }) =>
      masterConsoleService.runAction(action, {
        current_trial_ends_at: currentTrialEndsAt,
        days,
        plan_id: planId,
        store_id: storeId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master-console"] });
      toast({
        title: "Ação executada",
        description: "O Master Console foi atualizado.",
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível executar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
      });
    },
  });

  const stores = snapshotQuery.data?.stores ?? [];
  const filteredStores = stores.filter((store) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      store.name.toLowerCase().includes(query) ||
      store.slug.toLowerCase().includes(query) ||
      String(store.url || "").toLowerCase().includes(query) ||
      String(store.owner_email || "").toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "all" ||
      store.status === statusFilter ||
      store.subscription_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const runStoreAction = (
    store: MasterConsoleStoreRow,
    action: MasterConsoleAction,
    options?: { days?: number; planId?: string },
  ) => {
    actionMutation.mutate({
      action,
      currentTrialEndsAt: store.trial_ends_at,
      days: options?.days,
      planId: options?.planId,
      storeId: store.id,
    });
  };

  if (snapshotQuery.error) {
    return (
      <MasterShell adminEmail={adminEmail} onSignOut={onSignOut}>
        <Card className="border-red-200 bg-red-50 text-red-950">
          <CardContent className="flex gap-3 p-6">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-lg font-black">Acesso bloqueado</h2>
              <p className="mt-1 text-sm font-semibold text-red-700">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "Seu usuário não tem permissão para acessar o Master Console."}
              </p>
            </div>
          </CardContent>
        </Card>
      </MasterShell>
    );
  }

  return (
    <MasterShell adminEmail={adminEmail} onSignOut={onSignOut}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
            <ShieldCheck className="h-4 w-4" />
            Área interna Luup
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Clientes, receita e operação
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Visão global das lojas, assinaturas, uso e ações administrativas.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-fit gap-2 bg-white"
          onClick={() => void snapshotQuery.refetch()}
          disabled={snapshotQuery.isFetching}
        >
          <RefreshCcw className="h-4 w-4" />
          {snapshotQuery.isFetching ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MasterMetric
          icon={DollarSign}
          label="MRR"
          value={formatCurrency(snapshotQuery.data?.metrics.mrr)}
          detail={`ARR ${formatCurrency(snapshotQuery.data?.metrics.arr)}`}
        />
        <MasterMetric
          icon={Building2}
          label="Clientes ativos"
          value={formatNumber(snapshotQuery.data?.metrics.activeStores)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.paidStores)} pagantes`}
        />
        <MasterMetric
          icon={Clock3}
          label="Trials"
          value={formatNumber(snapshotQuery.data?.metrics.trialStores)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.trialsEndingSoon)} vencendo em 3 dias`}
        />
        <MasterMetric
          icon={AlertTriangle}
          label="Atenção"
          value={formatNumber(snapshotQuery.data?.metrics.expiredTrials)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.pausedStores)} lojas pausadas`}
        />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MasterMetric
          icon={Film}
          label="Vídeos ativos"
          value={formatNumber(snapshotQuery.data?.metrics.activeVideos)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.processingVideos)} processando`}
        />
        <MasterMetric
          icon={Eye}
          label="Views no mês"
          value={formatNumber(snapshotQuery.data?.metrics.monthViews)}
          detail="Eventos Luup registrados"
        />
        <MasterMetric
          icon={ShoppingCart}
          label="Carrinho no mês"
          value={formatNumber(snapshotQuery.data?.metrics.monthAddToCart)}
          detail="Adições ao carrinho"
        />
        <MasterMetric
          icon={Sparkles}
          label="Lojas monitoradas"
          value={formatNumber(stores.length)}
          detail={`Gerado em ${formatDate(snapshotQuery.data?.generated_at)}`}
        />
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="gap-4 border-b border-slate-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Assinantes e lojas</CardTitle>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {formatNumber(filteredStores.length)} resultado(s)
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar loja, URL ou e-mail"
                  className="w-full min-w-72 bg-white pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-white sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="trialing">Trial</SelectItem>
                  <SelectItem value="paused">Pausados</SelectItem>
                  <SelectItem value="disabled">Desativados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Loja</th>
                  <th className="px-5 py-3">Plano</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Uso</th>
                  <th className="px-5 py-3">Mês</th>
                  <th className="px-5 py-3">Integrações</th>
                  <th className="px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStores.map((store) => (
                  <StoreRow
                    key={store.id}
                    isActing={actionMutation.isPending}
                    store={store}
                    onAction={runStoreAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Últimas ações administrativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {(snapshotQuery.data?.audit_logs ?? []).length === 0 ? (
              <p className="text-sm font-medium text-slate-500">
                Nenhuma ação registrada ainda.
              </p>
            ) : (
              snapshotQuery.data?.audit_logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-bold text-slate-950">
                      {log.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm text-slate-500">
                      {log.admin_email || "admin"} · loja{" "}
                      {log.target_store_id || "global"}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    {formatDate(log.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </MasterShell>
  );
}

function MasterLogin({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("playluup@gmail.com");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Preencha e-mail e senha master." });
      return;
    }

    try {
      setIsSubmitting(true);
      await authService.signIn({ email: email.trim(), password });
      await onAuthenticated();
      toast({
        title: "Master Console liberado",
        description: "Sessão interna autenticada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível entrar no Master",
        description:
          error instanceof Error
            ? error.message
            : "Confira suas credenciais e tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MasterShell>
      <div className="grid min-h-[calc(100dvh-96px)] place-items-center px-4 py-10">
        <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black text-slate-950">
                Master Console
              </CardTitle>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Acesso interno da Luup para clientes, assinaturas e operação.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="master-email">E-mail master</Label>
                <Input
                  id="master-email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="master-password">Senha</Label>
                <Input
                  id="master-password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-white"
                />
              </div>
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Entrando..." : "Entrar no Master"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </MasterShell>
  );
}

function MasterShell({
  adminEmail,
  children,
  onSignOut,
}: {
  adminEmail?: string;
  children: React.ReactNode;
  onSignOut?: () => Promise<void>;
}) {
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  return (
    <div className="min-h-[100dvh] bg-[#f6f8fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <LuppLogo className="h-9 w-auto" />
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-black text-slate-950">
                Master Console
              </p>
              <p className="text-xs font-semibold text-slate-500">
                Operação interna
              </p>
            </div>
          </div>
          {adminEmail && onSignOut ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-slate-950">
                  {adminEmail}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  Admin Luup
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2 bg-white"
                disabled={isSigningOut}
                onClick={async () => {
                  setIsSigningOut(true);
                  try {
                    await onSignOut();
                  } finally {
                    setIsSigningOut(false);
                  }
                }}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function MasterMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">
          {value}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function StoreRow({
  isActing,
  onAction,
  store,
}: {
  isActing: boolean;
  onAction: (
    store: MasterConsoleStoreRow,
    action: MasterConsoleAction,
    options?: { days?: number; planId?: string },
  ) => void;
  store: MasterConsoleStoreRow;
}) {
  const [planId, setPlanId] = React.useState(store.plan_id || "start");

  React.useEffect(() => {
    setPlanId(store.plan_id || "start");
  }, [store.plan_id]);

  return (
    <tr className="align-top hover:bg-slate-50/70">
      <td className="px-5 py-4">
        <div className="flex min-w-72 gap-3">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="h-11 w-11 rounded-xl border border-slate-200 object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white">
              {initials(store.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black text-slate-950">{store.name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">
              {store.url || store.slug}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {store.owner_email || "Sem e-mail do dono"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="font-black text-slate-950">{store.plan_name}</p>
        <p className="text-xs font-bold text-emerald-600">
          {formatCurrency(store.mrr)}/mês
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Trial: {store.trial_days_left ?? "?"} dias
        </p>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-2">
          <Badge className={`w-fit border ${statusTone(store.status)}`}>
            Loja {store.status}
          </Badge>
          <Badge
            className={`w-fit border ${statusTone(store.subscription_status)}`}
          >
            Assinatura {store.subscription_status || "sem status"}
          </Badge>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-1 text-xs font-semibold text-slate-600">
          <span>{formatNumber(store.active_videos)} vídeos ativos</span>
          <span>{formatNumber(store.processing_videos)} processando</span>
          <span>{formatNumber(store.products)} produtos</span>
          <span>{formatNumber(store.active_widgets)} widgets</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-1 text-xs font-semibold text-slate-600">
          <span>{formatNumber(store.video_views_month)} views</span>
          <span>{formatNumber(store.feed_opens_month)} aberturas</span>
          <span>{formatNumber(store.add_to_cart_month)} carrinhos</span>
          <span>{formatNumber(store.product_clicks_month)} cliques</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex max-w-48 flex-wrap gap-2">
          {store.active_integrations.length === 0 ? (
            <Badge variant="outline" className="border-slate-200 text-slate-500">
              Manual
            </Badge>
          ) : (
            store.active_integrations.map((integration) => (
              <Badge
                key={`${store.id}-${integration.provider}`}
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700"
              >
                {integration.provider}
              </Badge>
            ))
          )}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="grid min-w-56 gap-2">
          <div className="flex gap-2">
            {store.status === "active" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                disabled={isActing}
                onClick={() => onAction(store, "pause_store")}
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Pausar
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1"
                disabled={isActing}
                onClick={() => onAction(store, "activate_store")}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Ativar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={isActing}
              onClick={() => onAction(store, "extend_trial", { days: 7 })}
            >
              <Activity className="h-3.5 w-3.5" />
              +7 trial
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label className="sr-only">Plano</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="h-8 bg-white text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="scale">Scale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isActing || planId === store.plan_id}
              onClick={() => onAction(store, "set_plan", { planId })}
            >
              Salvar
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
