import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import { useToast } from "@/hooks/use-toast";
import type { AdminStoreDetail, AdminWidget } from "@/types/admin-console";
import { Pencil, Save } from "lucide-react";
import { formatDate, statusTone } from "../shared";
import { JsonDetails, RunAdminAction } from "./shared";

export function WidgetsTab({
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
      <WidgetsCard
        detail={detail}
        isActing={isActing}
        onSave={(widgetId, patch) =>
          onAction({ action: "update_widget", widgetId, patch })
        }
      />
      <div className="grid gap-6">
        <FeedSettingsCard
          detail={detail}
          isActing={isActing}
          onSave={(patch) => onAction({ action: "update_feed", patch })}
        />
        <DomainsCard detail={detail} />
        <CustomPagesCard detail={detail} />
      </div>
    </div>
  );
}

function WidgetsCard({
  detail,
  isActing,
  onSave,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onSave: (widgetId: string, patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = React.useState<AdminWidget | null>(null);

  return (
    <SectionCard
      title="Widgets"
      description="Layout e configurações aplicados direto no widget da loja."
      contentClassName="gap-3"
    >
      {detail.widgets.length === 0 ? (
        <EmptyState message="Nenhum widget criado." />
      ) : (
        detail.widgets.map((widget) => (
          <ListItem key={widget.id} variant="panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-black text-foreground">{widget.name}</p>
                <Badge className={`border ${statusTone(widget.status)}`}>
                  {widget.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  {widget.type}
                  {widget.target ? ` · ${widget.target}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={() => setEditing(widget)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <JsonDetails label="Settings" value={widget.settings} />
            </div>
          </ListItem>
        ))
      )}
      {editing ? (
        <WidgetEditDialog
          isActing={isActing}
          widget={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            onSave(editing.id, patch);
            setEditing(null);
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function WidgetEditDialog({
  isActing,
  onClose,
  onSave,
  widget,
}: {
  isActing: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  widget: AdminWidget;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState(widget.name);
  const [status, setStatus] = React.useState(widget.status);
  const [target, setTarget] = React.useState(widget.target || "");
  const [settingsJson, setSettingsJson] = React.useState(() =>
    JSON.stringify(widget.settings ?? {}, null, 2),
  );

  const handleSave = () => {
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsJson || "{}");
    } catch {
      toast({
        title: "Settings inválidos",
        description: "O JSON de settings não pôde ser interpretado.",
      });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Informe um nome para o widget." });
      return;
    }
    // The server merges settings section-wise through the shared
    // widget-config contract (enums/colors/ranges normalized).
    onSave({ name: name.trim(), settings, status, target });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-modal-max max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar widget</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="widget-name">Nome</Label>
              <Input
                id="widget-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-target">Target (opcional)</Label>
            <Input
              id="widget-target"
              placeholder="Seletor/página alvo"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-settings">
              Settings (JSON — mesclado seção a seção e normalizado)
            </Label>
            <Textarea
              id="widget-settings"
              className="min-h-64 font-mono text-xs"
              value={settingsJson}
              onChange={(event) => setSettingsJson(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="gap-2" disabled={isActing} onClick={handleSave}>
            <Save className="h-4 w-4" />
            Salvar widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedSettingsCard({
  detail,
  isActing,
  onSave,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const { toast } = useToast();
  const feed = detail.feed_settings;
  const [isActive, setIsActive] = React.useState(feed?.is_active ?? true);
  const [slug, setSlug] = React.useState(feed?.slug ?? "videos");
  const [settingsJson, setSettingsJson] = React.useState(() =>
    JSON.stringify(feed?.settings ?? {}, null, 2),
  );

  React.useEffect(() => {
    setIsActive(feed?.is_active ?? true);
    setSlug(feed?.slug ?? "videos");
    setSettingsJson(JSON.stringify(feed?.settings ?? {}, null, 2));
  }, [feed]);

  const handleSave = () => {
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsJson || "{}");
    } catch {
      toast({
        title: "Settings inválidos",
        description: "O JSON de settings do feed não pôde ser interpretado.",
      });
      return;
    }
    if (!slug.trim()) {
      toast({ title: "Informe o slug do feed." });
      return;
    }
    onSave({ is_active: isActive, settings, slug: slug.trim() });
  };

  return (
    <SectionCard
      title="Feed"
      description={
        feed
          ? "Configuração pública do feed da loja."
          : "Feed ainda não configurado — salvar cria a configuração."
      }
      contentClassName="gap-4"
    >
      <ListItem className="flex items-center justify-between">
        <Label htmlFor="feed-active" className="text-sm font-bold text-foreground/80">
          Feed ativo
        </Label>
        <Switch id="feed-active" checked={isActive} onCheckedChange={setIsActive} />
      </ListItem>
      <div className="space-y-2">
        <Label htmlFor="feed-slug">Slug</Label>
        <Input
          id="feed-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="feed-settings">Settings (JSON — mesclado com o atual)</Label>
        <Textarea
          id="feed-settings"
          className="min-h-40 font-mono text-xs"
          value={settingsJson}
          onChange={(event) => setSettingsJson(event.target.value)}
        />
      </div>
      <Button className="w-fit gap-2" disabled={isActing} onClick={handleSave}>
        <Save className="h-4 w-4" />
        Salvar feed
      </Button>
    </SectionCard>
  );
}

function DomainsCard({ detail }: { detail: AdminStoreDetail }) {
  return (
    <SectionCard title="Domínios resolvidos">
      {detail.store_domains.length === 0 ? (
        <EmptyState message="Nenhum domínio indexado para o widget." />
      ) : (
        detail.store_domains.map((domain) => (
          <ListItem
            key={domain.id}
            className="flex items-center justify-between"
          >
            <span className="font-mono text-sm text-foreground">
              {domain.domain}
            </span>
            <span className="text-xs font-bold text-muted-foreground">
              {domain.source} · {formatDate(domain.created_at)}
            </span>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}

function CustomPagesCard({ detail }: { detail: AdminStoreDetail }) {
  return (
    <SectionCard title="Páginas customizadas">
      {detail.custom_pages.length === 0 ? (
        <EmptyState message="Nenhuma página customizada." />
      ) : (
        detail.custom_pages.map((page) => (
          <ListItem key={page.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">{page.name}</p>
              <p className="text-xs font-medium text-muted-foreground">
                /{page.slug} · {page.layout}
              </p>
            </div>
            <Badge className={`border ${statusTone(page.status)}`}>
              {page.status}
            </Badge>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}
