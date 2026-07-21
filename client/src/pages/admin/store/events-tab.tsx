import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/shared/StatCard";
import { useToast } from "@/hooks/use-toast";
import { adminConsoleService } from "@/services/admin-console.service";
import type { AdminStoreComment, AdminStoreDetail, AdminStoreEvent } from "@/types/admin-console";
import { Check, Copy, ListFilter } from "lucide-react";
import { formatDateTime, formatNumber, statusTone } from "../shared";
import {
  CursorListPanel,
  DetailField,
  DetailGrid,
  EVENT_LABELS,
  ExpandableListRow,
} from "./shared";

export function EventsTab({
  detail,
  storeId,
}: {
  detail: AdminStoreDetail;
  storeId: string;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Eventos (30 dias)"
          value={formatNumber(detail.counts.events_30d_total)}
          detail="Todos os tipos de evento"
        />
        <StatCard
          label="Comentários"
          value={formatNumber(detail.counts.comments_total)}
          detail={`${formatNumber(detail.counts.comments_pending)} pendentes de moderação`}
        />
      </div>
      <StoreEventsFeed storeId={storeId} />
      <CommentsFeed storeId={storeId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget events: windowed (30/60/90d), type-filtered, URL-searchable.
// ---------------------------------------------------------------------------

const EVENT_WINDOW_OPTIONS = [30, 60, 90] as const;

function parseEventUrl(raw: string) {
  try {
    // Events may store absolute URLs or bare paths; the placeholder base
    // makes both parseable and is stripped from the display.
    const url = new URL(raw, "https://placeholder.local");
    const path =
      url.hostname === "placeholder.local"
        ? url.pathname
        : `${url.host}${url.pathname}`;
    return { params: Array.from(url.searchParams.entries()), path };
  } catch {
    return { params: [] as [string, string][], path: raw };
  }
}

function StoreEventsFeed({ storeId }: { storeId: string }) {
  const [windowDays, setWindowDays] = React.useState(30);
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);

  const toggleType = (type: string, checked: boolean) => {
    setSelectedTypes((current) =>
      checked ? [...current, type] : current.filter((item) => item !== type),
    );
  };

  return (
    <CursorListPanel
      title="Últimos eventos do widget"
      countNoun="evento(s)"
      queryKey={["admin-console", "store", storeId, "events"]}
      extraKey={[windowDays, [...selectedTypes].sort().join(",")]}
      hasExtraFilters={selectedTypes.length > 0}
      fetchPage={async ({ cursor, search }) => {
        const page = await adminConsoleService.getStoreEvents(storeId, {
          cursor,
          days: windowDays,
          search,
          types: selectedTypes,
        });
        return { items: page.events, next_cursor: page.next_cursor };
      }}
      searchPlaceholder="Buscar na URL e query (ex.: utm_source=instagram)"
      emptyMessage={`Nenhum evento registrado nos últimos ${windowDays} dias.`}
      emptyFilteredMessage="Nenhum evento corresponde aos filtros no período."
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {EVENT_WINDOW_OPTIONS.map((days) => (
            <Button
              key={days}
              size="sm"
              variant={windowDays === days ? "default" : "ghost"}
              className="h-7 px-2 text-xs font-bold"
              onClick={() => setWindowDays(days)}
            >
              {days} dias
            </Button>
          ))}
        </div>
      }
      extraFilters={
        <EventTypeFilter
          selectedTypes={selectedTypes}
          onClear={() => setSelectedTypes([])}
          onToggle={toggleType}
        />
      }
      renderItem={(event) => <EventRow key={event.id} event={event} />}
    />
  );
}

function EventTypeFilter({
  onClear,
  onToggle,
  selectedTypes,
}: {
  onClear: () => void;
  onToggle: (type: string, checked: boolean) => void;
  selectedTypes: string[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-fit gap-2">
          <ListFilter className="h-4 w-4" />
          {selectedTypes.length === 0
            ? "Todos os eventos"
            : `${selectedTypes.length} tipo(s) de evento`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Tipos de evento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(EVENT_LABELS).map(([type, label]) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={selectedTypes.includes(type)}
            onCheckedChange={(checked) => onToggle(type, checked)}
            onSelect={(event) => event.preventDefault()}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        {selectedTypes.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs font-bold text-primary hover:text-info-surface-foreground"
              onClick={onClear}
            >
              Limpar seleção
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventRow({ event }: { event: AdminStoreEvent }) {
  const parsed = event.url ? parseEventUrl(event.url) : null;

  return (
    <ExpandableListRow
      summary={
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">
              {EVENT_LABELS[event.event_type] || event.event_type}
            </p>
            <span className="shrink-0 text-xs font-bold text-muted-foreground">
              {formatDateTime(event.created_at)}
            </span>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {parsed ? parsed.path || "/" : "Sem URL registrada"}
          </p>
        </>
      }
    >
      {event.video || event.product ? (
        <p className="text-xs font-medium text-muted-foreground">
          {[
            event.video ? `vídeo: ${event.video.title}` : null,
            event.product ? `produto: ${event.product.name}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {parsed && parsed.params.length > 0 ? (
        <div>
          <p className="text-overline uppercase text-muted-foreground/70">
            Parâmetros de query (clique para copiar o valor)
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {parsed.params.map(([name, value], index) => (
              <CopyParamChip key={`${name}-${index}`} name={name} value={value} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs font-medium text-muted-foreground/70">
          {parsed
            ? "Sem parâmetros de query na URL."
            : "Evento sem URL registrada."}
        </p>
      )}
    </ExpandableListRow>
  );
}

function CopyParamChip({ name, value }: { name: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      title={`Copiar valor de ${name}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-2xs transition-colors ${
        copied
          ? "border-success-surface-border bg-success-surface text-success-surface-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-info-surface hover:text-info-surface-foreground"
      }`}
      onClick={async (clickEvent) => {
        clickEvent.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast({ title: "Não foi possível copiar o valor." });
        }
      }}
    >
      <span className="font-bold">{name}</span>=
      <span className="truncate">
        {value.length > 40 ? `${value.slice(0, 40)}...` : value || '""'}
      </span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 shrink-0" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentsFeed({ storeId }: { storeId: string }) {
  return (
    <CursorListPanel
      title="Comentários"
      countNoun="comentário(s)"
      queryKey={["admin-console", "store", storeId, "comments"]}
      fetchPage={({ cursor, search }) =>
        adminConsoleService.getStoreComments(storeId, { cursor, search })
      }
      searchPlaceholder="Buscar por texto ou autor"
      emptyMessage="Nenhum comentário nos vídeos."
      emptyFilteredMessage="Nenhum comentário corresponde à busca."
      renderItem={(comment) => (
        <CommentRow key={comment.id} comment={comment} />
      )}
    />
  );
}

function CommentRow({ comment }: { comment: AdminStoreComment }) {
  return (
    <ExpandableListRow
      summary={
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                className={`border ${statusTone(comment.status === "approved" ? "active" : comment.status)}`}
              >
                {comment.status}
              </Badge>
              <span className="text-xs font-bold text-foreground/80">
                {comment.author_name || comment.author_email || "Anônimo"}
              </span>
            </div>
            <span className="shrink-0 text-xs font-bold text-muted-foreground">
              {formatDateTime(comment.created_at)}
            </span>
          </div>
          <p className="truncate text-sm text-foreground/80">{comment.body}</p>
        </>
      }
    >
      <DetailField label="Comentário completo">{comment.body}</DetailField>
      <DetailGrid>
        <DetailField label="Autor">
          {comment.author_name || "Anônimo"}
          {comment.author_email ? ` · ${comment.author_email}` : ""}
        </DetailField>
        <DetailField label="Vídeo">
          {comment.video ? comment.video.title : "—"}
        </DetailField>
        <DetailField label="Datas">
          criado {formatDateTime(comment.created_at)} · atualizado{" "}
          {formatDateTime(comment.updated_at)}
        </DetailField>
        <DetailField label="ID interno">
          <span className="font-mono">{comment.id}</span>
        </DetailField>
      </DetailGrid>
    </ExpandableListRow>
  );
}
