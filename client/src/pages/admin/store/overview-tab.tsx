import { formatBRL } from "@/lib/utils";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPickerField } from "@/components/shared/ColorPickerField";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import type { AdminStoreDetail, AdminStorePatch } from "@/types/admin-console";
import { Save } from "lucide-react";
import { formatDate, formatNumber, statusTone } from "../shared";
import { EVENT_LABELS, RunAdminAction } from "./shared";

export function OverviewTab({
  detail,
  isActing,
  onAction,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onAction: RunAdminAction;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <StoreConfigCard
        detail={detail}
        isActing={isActing}
        onSave={(patch) => onAction({ action: "update_store", patch })}
      />
      <div className="grid gap-6">
        <SubscriptionsCard detail={detail} />
        <AnalyticsSummaryCard detail={detail} />
      </div>
    </div>
  );
}

function StoreConfigCard({
  detail,
  isActing,
  onSave,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onSave: (patch: AdminStorePatch) => void;
}) {
  const { store } = detail;
  const storeAsForm = React.useCallback(
    () => ({
      button_color: store.button_color,
      logo_url: store.logo_url || "",
      name: store.name,
      platform: store.platform || "",
      primary_color: store.primary_color,
      secondary_color: store.secondary_color,
      segment: store.segment || "",
      url: store.url || "",
    }),
    [store],
  );
  const [form, setForm] = React.useState(storeAsForm);

  React.useEffect(() => {
    setForm(storeAsForm());
  }, [storeAsForm]);

  const isDirty = Object.entries(storeAsForm()).some(
    ([field, storedValue]) => form[field as keyof typeof form] !== storedValue,
  );

  const setField = (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const setColor = (field: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <SectionCard
      title="Configurações da loja"
      description="Ajustes aplicados direto no cadastro da loja (auditados)."
      contentClassName="gap-4"
    >
      <div className="space-y-2">
        <Label htmlFor="store-name">Nome</Label>
        <Input id="store-name" value={form.name} onChange={setField("name")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="store-url">URL da loja</Label>
        <Input
          id="store-url"
          placeholder="https://..."
          value={form.url}
          onChange={setField("url")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="store-platform">Plataforma</Label>
          <Input
            id="store-platform"
            placeholder="nuvemshop, shopify..."
            value={form.platform}
            onChange={setField("platform")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="store-segment">Segmento</Label>
          <Input
            id="store-segment"
            value={form.segment}
            onChange={setField("segment")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="store-logo">Logo (URL)</Label>
        <Input
          id="store-logo"
          placeholder="https://..."
          value={form.logo_url}
          onChange={setField("logo_url")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ColorPickerField
          id="store-primary"
          label="Cor primária"
          value={form.primary_color}
          onChange={setColor("primary_color")}
        />
        <ColorPickerField
          id="store-secondary"
          label="Cor secundária"
          value={form.secondary_color}
          onChange={setColor("secondary_color")}
        />
        <ColorPickerField
          id="store-button"
          label="Cor do botão"
          value={form.button_color}
          onChange={setColor("button_color")}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-muted-foreground">
          <p>id: {store.id}</p>
          <p>slug: {store.slug}</p>
        </div>
        <Button
          className="gap-2"
          disabled={isActing || !isDirty || !form.name.trim()}
          onClick={() => onSave(form)}
        >
          <Save className="h-4 w-4" />
          Salvar alterações
        </Button>
      </div>
    </SectionCard>
  );
}

function SubscriptionsCard({ detail }: { detail: AdminStoreDetail }) {
  return (
    <SectionCard title="Assinaturas" contentClassName="gap-3">
      {detail.subscriptions.length === 0 ? (
        <EmptyState message="Nenhuma assinatura registrada." />
      ) : (
        detail.subscriptions.map((subscription) => (
          <ListItem key={subscription.id} variant="panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-black text-foreground">
                  {subscription.plan?.name || subscription.plan_id || "Sem plano"}
                </p>
                <Badge className={`border ${statusTone(subscription.status)}`}>
                  {subscription.status}
                </Badge>
              </div>
              <p className="text-xs font-bold text-muted-foreground">
                criada em {formatDate(subscription.created_at)}
              </p>
            </div>
            <div className="mt-2 grid gap-1 text-xs font-semibold text-muted-foreground sm:grid-cols-2">
              <span>
                Período: {formatDate(subscription.current_period_start)} →{" "}
                {formatDate(subscription.current_period_end)}
              </span>
              <span>
                Provider: {subscription.provider || "—"}
                {subscription.provider_status
                  ? ` (${subscription.provider_status})`
                  : ""}
              </span>
              {subscription.discount_code ? (
                <span>
                  Cupom: {subscription.discount_code}
                  {subscription.discount_percent
                    ? ` (-${Number(subscription.discount_percent)}%)`
                    : subscription.discount_amount
                      ? ` (-${formatBRL(Number(subscription.discount_amount))})`
                      : ""}
                </span>
              ) : null}
              {subscription.provider_subscription_id ? (
                <span className="truncate">
                  Ref: {subscription.provider_subscription_id}
                </span>
              ) : null}
            </div>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}

function AnalyticsSummaryCard({ detail }: { detail: AdminStoreDetail }) {
  const rows = [...detail.analytics_30d].sort((a, b) => b.count - a.count);

  return (
    <SectionCard
      title="Eventos (últimos 30 dias)"
      contentClassName="sm:grid-cols-2"
    >
      {rows.length === 0 ? (
        <EmptyState message="Nenhum evento registrado no período." />
      ) : (
        rows.map((row) => (
          <ListItem
            key={row.event_type}
            className="flex items-center justify-between"
          >
            <span className="text-xs font-bold text-muted-foreground">
              {EVENT_LABELS[row.event_type] || row.event_type}
            </span>
            <span className="text-sm font-black text-foreground">
              {formatNumber(row.count)}
            </span>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}
