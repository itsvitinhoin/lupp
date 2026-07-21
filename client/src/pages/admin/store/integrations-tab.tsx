import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandIcon } from "@/components/shared/BrandIcons";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import { useToast } from "@/hooks/use-toast";
import { integrationsService } from "@/services/integrations.service";
import { widgetsService } from "@/services/widgets.service";
import type { AdminIntegration, AdminStoreDetail } from "@/types/admin-console";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Check, Copy, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { formatDate, formatDateTime, statusTone } from "../shared";
import { JsonDetails } from "./shared";

export function IntegrationsTab({
  detail,
  storeId,
}: {
  detail: AdminStoreDetail;
  storeId: string;
}) {
  return (
    <div className="grid gap-6">
      {detail.integrations.length === 0 ? (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <EmptyState message="Esta loja não tem integrações configuradas." />
          </CardContent>
        </Card>
      ) : (
        detail.integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            storeId={storeId}
          />
        ))
      )}
      <WebhookEventsCard detail={detail} />
    </div>
  );
}

function IntegrationCard({
  integration,
  storeId,
}: {
  integration: AdminIntegration;
  storeId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const maintenance = useMutation({
    mutationFn: async (task: "sync_products" | "reinstall_script") => {
      if (task === "reinstall_script") {
        return widgetsService.installNuvemshopScript(storeId);
      }
      return integration.provider === "shopify"
        ? integrationsService.syncShopifyProducts(storeId)
        : integrationsService.syncNuvemshopProducts(storeId);
    },
    onSuccess: async (result, task) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-console", "store", storeId],
      });
      const summary =
        task === "sync_products"
          ? `${(result as { count?: number }).count ?? 0} produto(s) sincronizado(s).`
          : (result as { verified?: boolean }).verified
            ? "Script verificado e ativo na loja."
            : "Instalação enviada, mas a Nuvemshop ainda não confirmou o script.";
      toast({ title: "Integração atualizada", description: summary });
    },
    onError: (error) => {
      toast({
        title: "A operação falhou",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    },
  });

  const isSyncable =
    integration.status === "active" &&
    (integration.provider === "nuvemshop" || integration.provider === "shopify");

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <BrandIcon brand={integration.provider} />
          <span className="capitalize">{integration.provider}</span>
          <Badge className={`border ${statusTone(integration.status)}`}>
            {integration.status}
          </Badge>
        </span>
      }
      actions={
        <p className="text-xs font-bold text-muted-foreground">
          Conectada em {formatDate(integration.connected_at)} · último sync{" "}
          {formatDateTime(integration.last_sync_at)}
        </p>
      }
      contentClassName="gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          ID externo:{" "}
          <span className="font-mono text-foreground">
            {integration.external_store_id || "—"}
          </span>
        </p>
        {isSyncable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={maintenance.isPending}
              onClick={() => maintenance.mutate("sync_products")}
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${maintenance.isPending ? "animate-spin" : ""}`}
              />
              Sincronizar produtos
            </Button>
            {integration.provider === "nuvemshop" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                disabled={maintenance.isPending}
                onClick={() => maintenance.mutate("reinstall_script")}
              >
                <Activity className="h-3.5 w-3.5" />
                Reinstalar script
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {integration.secret ? (
        <div className="rounded-xl border border-warning-surface-border bg-warning-surface p-4">
          <p className="text-overline uppercase text-warning-surface-foreground">
            Segredo da integração
          </p>
          <div className="mt-2 grid gap-2">
            <SecretValue
              label="Access token"
              value={integration.secret.access_token}
            />
            <div className="grid gap-1 text-xs font-semibold text-warning-surface-foreground sm:grid-cols-2">
              <span>Tipo: {integration.secret.token_type || "—"}</span>
              <span>
                Atualizado: {formatDateTime(integration.secret.updated_at)}
              </span>
              {integration.secret.scope ? (
                <span className="sm:col-span-2">
                  Escopos: {integration.secret.scope}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState message="Sem segredo armazenado para esta integração." />
      )}

      <JsonDetails label="Settings" value={integration.settings} />
      <JsonDetails label="Credentials" value={integration.credentials} />
    </SectionCard>
  );
}

function SecretValue({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Não foi possível copiar o valor." });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-warning-surface-foreground">{label}</p>
        <p className="truncate font-mono text-sm text-warning-surface-foreground">
          {revealed ? value : "•".repeat(Math.min(value.length, 32))}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {revealed ? "Ocultar" : "Revelar"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={() => void copy()}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        Copiar
      </Button>
    </div>
  );
}

function WebhookEventsCard({ detail }: { detail: AdminStoreDetail }) {
  return (
    <SectionCard title="Webhooks recentes">
      {detail.webhook_events.length === 0 ? (
        <EmptyState message="Nenhum webhook recebido para as integrações desta loja." />
      ) : (
        detail.webhook_events.map((event) => (
          <ListItem
            key={event.id}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2">
              <Badge className={`border ${statusTone(event.status)}`}>
                {event.status}
              </Badge>
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <BrandIcon brand={event.provider} className="h-4 w-4" />
                {event.provider} · {event.event}
              </span>
              {event.error ? (
                <span className="text-xs font-bold text-destructive">
                  {event.error}
                </span>
              ) : null}
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {formatDateTime(event.created_at)}
            </span>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}
