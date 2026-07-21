import { formatBRL } from "@/lib/utils";
import React from "react";
import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIcon } from "@/components/shared/BrandIcons";
import { StatCard } from "@/components/shared/StatCard";
import { useToast } from "@/hooks/use-toast";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminStoreDetail } from "@/types/admin-console";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
} from "lucide-react";
import {
  AdminGate,
  AdminShell,
  formatDate,
  formatNumber,
  initials,
  statusTone,
} from "../shared";
import { AdminActionInput, RunAdminAction } from "./shared";
import { ActivityTab } from "./activity-tab";
import { EventsTab } from "./events-tab";
import { IntegrationsTab } from "./integrations-tab";
import { OverviewTab } from "./overview-tab";
import { ProductsTab } from "./products-tab";
import { UsersTab } from "./users-tab";
import { VideosTab } from "./videos-tab";
import { WidgetsTab } from "./widgets-tab";

export default function AdminStorePage() {
  const [, params] = useRoute("/admin/:storeId");
  const storeId = params?.storeId ?? "";

  return (
    <AdminGate>
      {({ adminEmail, onSignOut }) => (
        <StoreDetail
          adminEmail={adminEmail}
          onSignOut={onSignOut}
          storeId={storeId}
        />
      )}
    </AdminGate>
  );
}

function StoreDetail({
  adminEmail,
  onSignOut,
  storeId,
}: {
  adminEmail: string;
  onSignOut: () => Promise<void>;
  storeId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["admin-console", "store", storeId],
    queryFn: () => adminConsoleService.getStoreDetail(storeId),
    enabled: Boolean(storeId),
    retry: false,
  });

  const actionMutation = useMutation({
    mutationFn: (input: AdminActionInput) =>
      adminConsoleService.runAction(input.action, {
        current_trial_ends_at: detailQuery.data?.store.trial_ends_at,
        days: input.days,
        email: input.email,
        member_id: input.memberId,
        patch: input.patch,
        plan_id: input.planId,
        role: input.role,
        store_id: storeId,
        user_id: input.userId,
        widget_id: input.widgetId,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-console", "store", storeId],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin-console"], exact: true }),
      ]);
      toast({
        title: "Ação executada",
        description: "A loja foi atualizada.",
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

  const runAction: RunAdminAction = (input) => actionMutation.mutate(input);

  if (detailQuery.isPending) {
    return (
      <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
        <BackLink />
        <div className="grid gap-4">
          <div className="h-36 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </AdminShell>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
        <BackLink />
        <Card className="border-destructive-surface-border bg-destructive-surface text-destructive-surface-foreground">
          <CardContent className="flex gap-3 p-4 sm:p-6">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-lg font-black">Loja não encontrada</h2>
              <p className="mt-1 text-sm font-semibold text-destructive">
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "Não foi possível carregar os detalhes desta loja."}
              </p>
            </div>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  const detail = detailQuery.data;
  const isActing = actionMutation.isPending;

  return (
    <AdminShell adminEmail={adminEmail} onSignOut={onSignOut}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <BackLink />
        <Button
          variant="outline"
          className="w-fit gap-2"
          onClick={() => void detailQuery.refetch()}
          disabled={detailQuery.isFetching}
        >
          <RefreshCcw
            className={`h-4 w-4 ${detailQuery.isFetching ? "animate-spin" : ""}`}
          />
          {detailQuery.isFetching ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <StoreHeaderCard detail={detail} isActing={isActing} onAction={runAction} />
      <StoreStatsRow detail={detail} />

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 h-auto flex-wrap justify-start bg-card">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="integrations">
            Integrações ({detail.integrations.length})
          </TabsTrigger>
          <TabsTrigger value="widgets">
            Widgets & Feed ({detail.widgets.length})
          </TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="videos">Vídeos</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="activity">Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab detail={detail} isActing={isActing} onAction={runAction} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab detail={detail} storeId={storeId} />
        </TabsContent>
        <TabsContent value="widgets">
          <WidgetsTab detail={detail} isActing={isActing} onAction={runAction} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab detail={detail} isActing={isActing} onAction={runAction} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab detail={detail} storeId={storeId} />
        </TabsContent>
        <TabsContent value="videos">
          <VideosTab detail={detail} storeId={storeId} />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab detail={detail} storeId={storeId} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab detail={detail} />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin"
      className="inline-flex w-fit items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para todas as lojas
    </Link>
  );
}

function StoreHeaderCard({
  detail,
  isActing,
  onAction,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onAction: RunAdminAction;
}) {
  const { store } = detail;

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-6 p-4 sm:p-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="h-16 w-16 rounded-2xl border border-border bg-white object-contain"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">
              {initials(store.name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-section-title text-foreground">
                {store.name}
              </h1>
              <Badge className={`border ${statusTone(store.status)}`}>
                {store.status}
              </Badge>
              {store.platform ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-info-surface-border bg-info-surface text-info-surface-foreground"
                >
                  <BrandIcon brand={store.platform} className="h-3.5 w-3.5" />
                  {store.platform}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              /{store.slug} · criada em {formatDate(store.created_at)}
            </p>
            {store.url ? (
              <a
                href={store.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                {store.url}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground">
              Dono:{" "}
              <span className="font-bold text-foreground">
                {detail.owner.name}
              </span>{" "}
              · {detail.owner.email}
            </p>
          </div>
        </div>

        <div className="grid shrink-0 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {store.status === "active" ? (
              <Button
                variant="outline"
                className="gap-2"
                disabled={isActing}
                onClick={() => onAction({ action: "pause_store" })}
              >
                <PauseCircle className="h-4 w-4" />
                Pausar loja
              </Button>
            ) : (
              <Button
                className="gap-2"
                disabled={isActing}
                onClick={() => onAction({ action: "activate_store" })}
              >
                <PlayCircle className="h-4 w-4" />
                Ativar loja
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              disabled={isActing}
              onClick={() => onAction({ action: "extend_trial", days: 7 })}
            >
              <Activity className="h-4 w-4" />
              +7 trial
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={isActing}
              onClick={() => onAction({ action: "extend_trial", days: 30 })}
            >
              <Activity className="h-4 w-4" />
              +30 trial
            </Button>
          </div>
          <PlanPicker
            currentPlanId={store.plan_id}
            isActing={isActing}
            onSave={(planId) => onAction({ action: "set_plan", planId })}
          />
          <div className="text-right text-xs font-semibold text-muted-foreground">
            {detail.trial_days_left === null
              ? "Sem trial ativo"
              : detail.trial_days_left <= 0
                ? "Trial expirado"
                : `Trial acaba em ${detail.trial_days_left} dia(s) (${formatDate(store.trial_ends_at)})`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StoreStatsRow({ detail }: { detail: AdminStoreDetail }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="MRR"
        value={formatBRL(detail.mrr)}
        detail={`Plano ${detail.plan?.name || detail.store.plan_id}`}
      />
      <StatCard
        label="Vídeos"
        value={formatNumber(detail.counts.videos_active)}
        detail={`${formatNumber(detail.counts.videos_total)} no total · ${formatNumber(detail.counts.videos_processing)} processando`}
      />
      <StatCard
        label="Produtos"
        value={formatNumber(detail.counts.products_active)}
        detail={`${formatNumber(detail.counts.products_total)} no total`}
      />
      <StatCard
        label="Widgets"
        value={formatNumber(detail.counts.widgets_active)}
        detail={`${formatNumber(detail.counts.widgets_total)} no total · ${formatNumber(detail.counts.comments_pending)} comentários pendentes`}
      />
    </div>
  );
}

function PlanPicker({
  currentPlanId,
  isActing,
  onSave,
}: {
  currentPlanId: string;
  isActing: boolean;
  onSave: (planId: string) => void;
}) {
  const [planId, setPlanId] = React.useState(currentPlanId || "start");

  React.useEffect(() => {
    setPlanId(currentPlanId || "start");
  }, [currentPlanId]);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <Select value={planId} onValueChange={setPlanId}>
        <SelectTrigger className="bg-card text-sm font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="start">Start</SelectItem>
          <SelectItem value="growth">Growth</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="scale">Scale</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={isActing || planId === currentPlanId}
        onClick={() => onSave(planId)}
      >
        Trocar plano
      </Button>
    </div>
  );
}
