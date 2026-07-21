import { formatBRL } from "@/lib/utils";
import React from "react";
import { useLocation } from "wouter";
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
import { BrandIcon } from "@/components/shared/BrandIcons";
import { StatCard } from "@/components/shared/StatCard";
import { useToast } from "@/hooks/use-toast";
import { adminConsoleService } from "@/services/admin-console.service";
import type {
  AdminConsoleAction,
  AdminConsoleStoreRow,
} from "@/types/admin-console";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronRight,
  Clock3,
  DollarSign,
  Eye,
  Film,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import {
  AdminGate,
  AdminShell,
  formatDate,
  formatNumber,
  initials,
  statusTone,
} from "./shared";

export default function AdminConsolePage() {
  return (
    <AdminGate>
      {({ adminEmail, onSignOut }) => (
        <AdminDashboard adminEmail={adminEmail} onSignOut={onSignOut} />
      )}
    </AdminGate>
  );
}

function AdminDashboard({
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
    queryKey: ["admin-console"],
    queryFn: () => adminConsoleService.getSnapshot(),
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
      action: AdminConsoleAction;
      currentTrialEndsAt?: string | null;
      days?: number;
      planId?: string;
      storeId: string;
    }) =>
      adminConsoleService.runAction(action, {
        current_trial_ends_at: currentTrialEndsAt,
        days,
        plan_id: planId,
        store_id: storeId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-console"] });
      toast({
        title: "Ação executada",
        description: "O Admin Console foi atualizado.",
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
    store: AdminConsoleStoreRow,
    action: AdminConsoleAction,
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
      <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
        <Card className="border-destructive-surface-border bg-destructive-surface text-destructive-surface-foreground">
          <CardContent className="flex gap-3 p-6">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-lg font-black">Acesso bloqueado</h2>
              <p className="mt-1 text-sm font-semibold text-destructive">
                {snapshotQuery.error instanceof Error
                  ? snapshotQuery.error.message
                  : "Seu usuário não tem permissão para acessar o Admin Console."}
              </p>
            </div>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  const isLoading = snapshotQuery.isPending;

  return (
    <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-info-surface-border bg-info-surface px-3 py-1 text-overline uppercase text-info-surface-foreground">
            <ShieldCheck className="h-4 w-4" />
            Área interna Luup
          </div>
          <h2 className="mt-3 text-page-title text-foreground">
            Clientes, receita e operação
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Visão global das lojas, assinaturas, uso e ações administrativas.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-fit gap-2"
          onClick={() => void snapshotQuery.refetch()}
          disabled={snapshotQuery.isFetching}
        >
          <RefreshCcw
            className={`h-4 w-4 ${snapshotQuery.isFetching ? "animate-spin" : ""}`}
          />
          {snapshotQuery.isFetching ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={DollarSign}
          isLoading={isLoading}
          label="MRR"
          value={formatBRL(snapshotQuery.data?.metrics.mrr)}
          detail={`ARR ${formatBRL(snapshotQuery.data?.metrics.arr)}`}
        />
        <StatCard
          icon={Building2}
          isLoading={isLoading}
          label="Clientes ativos"
          value={formatNumber(snapshotQuery.data?.metrics.activeStores)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.paidStores)} pagantes`}
        />
        <StatCard
          icon={Clock3}
          isLoading={isLoading}
          label="Trials"
          value={formatNumber(snapshotQuery.data?.metrics.trialStores)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.trialsEndingSoon)} vencendo em 3 dias`}
        />
        <StatCard
          icon={AlertTriangle}
          isLoading={isLoading}
          label="Atenção"
          value={formatNumber(snapshotQuery.data?.metrics.expiredTrials)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.pausedStores)} lojas pausadas`}
        />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Film}
          isLoading={isLoading}
          label="Vídeos ativos"
          value={formatNumber(snapshotQuery.data?.metrics.activeVideos)}
          detail={`${formatNumber(snapshotQuery.data?.metrics.processingVideos)} processando`}
        />
        <StatCard
          icon={Eye}
          isLoading={isLoading}
          label="Views no mês"
          value={formatNumber(snapshotQuery.data?.metrics.monthViews)}
          detail="Eventos Luup registrados"
        />
        <StatCard
          icon={ShoppingCart}
          isLoading={isLoading}
          label="Carrinho no mês"
          value={formatNumber(snapshotQuery.data?.metrics.monthAddToCart)}
          detail="Adições ao carrinho"
        />
        <StatCard
          icon={Sparkles}
          isLoading={isLoading}
          label="Lojas monitoradas"
          value={formatNumber(stores.length)}
          detail={`Gerado em ${formatDate(snapshotQuery.data?.generated_at)}`}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 border-b border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Assinantes e lojas</CardTitle>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {formatNumber(filteredStores.length)} resultado(s) · clique em
                uma loja para abrir o painel completo
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar loja, URL ou e-mail"
                  className="w-full bg-card pl-9 sm:min-w-72"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-card sm:w-44">
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
            <table className="w-full min-w-table-min text-left text-sm">
              <thead className="sticky top-0 bg-muted/50 text-overline uppercase text-muted-foreground">
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
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <SkeletonRows />
                ) : filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <p className="font-bold text-foreground/80">
                        Nenhuma loja encontrada
                      </p>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">
                        Ajuste a busca ou o filtro de status.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredStores.map((store) => (
                    <StoreRow
                      key={store.id}
                      isActing={actionMutation.isPending}
                      store={store}
                      onAction={runStoreAction}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle>Últimas ações administrativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {(snapshotQuery.data?.audit_logs ?? []).length === 0 ? (
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma ação registrada ainda.
              </p>
            ) : (
              snapshotQuery.data?.audit_logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-bold text-foreground">
                      {log.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {log.admin_email || "admin"} · loja{" "}
                      {log.target_store_id || "global"}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">
                    {formatDate(log.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <tr key={index}>
          {Array.from({ length: 7 }, (_, cell) => (
            <td key={cell} className="px-5 py-5">
              <div className="h-4 w-full max-w-40 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function TrialBadge({ store }: { store: AdminConsoleStoreRow }) {
  if (store.trial_days_left === null) {
    return <p className="mt-1 text-xs text-muted-foreground">Sem trial</p>;
  }
  if (store.trial_days_left <= 0) {
    return (
      <p className="mt-1 text-xs font-bold text-destructive">Trial expirado</p>
    );
  }
  return (
    <p
      className={`mt-1 text-xs ${
        store.trial_days_left <= 3
          ? "font-bold text-warning"
          : "text-muted-foreground"
      }`}
    >
      Trial: {store.trial_days_left} dias
    </p>
  );
}

function StoreRow({
  isActing,
  onAction,
  store,
}: {
  isActing: boolean;
  onAction: (
    store: AdminConsoleStoreRow,
    action: AdminConsoleAction,
    options?: { days?: number; planId?: string },
  ) => void;
  store: AdminConsoleStoreRow;
}) {
  const [, navigate] = useLocation();
  const [planId, setPlanId] = React.useState(store.plan_id || "start");

  React.useEffect(() => {
    setPlanId(store.plan_id || "start");
  }, [store.plan_id]);

  const openDetail = () => navigate(`/admin/${store.id}`);

  return (
    <tr
      className="cursor-pointer align-top transition-colors hover:bg-primary/5"
      onClick={openDetail}
    >
      <td className="px-5 py-4">
        <div className="flex min-w-72 gap-3">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="h-11 w-11 rounded-xl border border-border bg-white object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
              {initials(store.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-black text-foreground">
              {store.name}
              <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
            </p>
            <p className="truncate text-xs font-semibold text-muted-foreground">
              {store.url || store.slug}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {store.owner_email || "Sem e-mail do dono"}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="font-black text-foreground">{store.plan_name}</p>
        <p className="text-xs font-bold text-success">
          {formatBRL(store.mrr)}/mês
        </p>
        <TrialBadge store={store} />
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
        <div className="grid gap-1 text-xs font-semibold text-muted-foreground">
          <span>{formatNumber(store.active_videos)} vídeos ativos</span>
          <span>{formatNumber(store.processing_videos)} processando</span>
          <span>{formatNumber(store.products)} produtos</span>
          <span>{formatNumber(store.active_widgets)} widgets</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="grid gap-1 text-xs font-semibold text-muted-foreground">
          <span>{formatNumber(store.video_views_month)} views</span>
          <span>{formatNumber(store.feed_opens_month)} aberturas</span>
          <span>{formatNumber(store.add_to_cart_month)} carrinhos</span>
          <span>{formatNumber(store.product_clicks_month)} cliques</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex max-w-48 flex-wrap gap-2">
          {store.active_integrations.length === 0 ? (
            <Badge variant="outline" className="border-border text-muted-foreground">
              Manual
            </Badge>
          ) : (
            store.active_integrations.map((integration) => (
              <Badge
                key={`${store.id}-${integration.provider}`}
                variant="outline"
                className="gap-1 border-info-surface-border bg-info-surface text-info-surface-foreground"
              >
                <BrandIcon brand={integration.provider} className="h-3.5 w-3.5" />
                {integration.provider}
              </Badge>
            ))
          )}
        </div>
      </td>
      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
        <div className="grid min-w-56 gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={openDetail}
            >
              <Eye className="h-3.5 w-3.5" />
              Detalhes
            </Button>
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
                <SelectTrigger className="h-8 bg-card text-xs font-bold">
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
