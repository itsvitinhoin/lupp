import React from "react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import type { AdminConsoleAction, AdminStorePatch } from "@/types/admin-console";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { formatNumber } from "../shared";

/** Human labels for AnalyticsEventType values, shared by filters and lists. */
export const EVENT_LABELS: Record<string, string> = {
  add_to_cart_click: "Carrinho",
  comment_create: "Comentários",
  feed_close: "Feed fechado",
  feed_open: "Feed aberto",
  launcher_impression: "Launcher visto",
  like_click: "Likes",
  product_click: "Cliques em produto",
  share_click: "Compartilhamentos",
  video_complete: "Vídeos completos",
  video_progress: "Progresso de vídeo",
  video_view: "Views de vídeo",
  widget_view: "Views do widget",
};

export const MEMBER_ROLE_OPTIONS = [
  "owner",
  "admin",
  "marketing",
  "editor",
  "analyst",
] as const;

/** One mutation input shape for every admin-console action on this page. */
export type AdminActionInput = {
  action: AdminConsoleAction;
  days?: number;
  email?: string;
  memberId?: string;
  patch?: AdminStorePatch | Record<string, unknown>;
  planId?: string;
  role?: string;
  userId?: string;
  widgetId?: string;
};

export type RunAdminAction = (input: AdminActionInput) => void;

/**
 * List entry with a clickable summary row (chevron) that expands an inline
 * details area beneath it.
 */
export function ExpandableListRow({
  children,
  summary,
}: {
  children: React.ReactNode;
  summary: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <ListItem className="p-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <div className="min-w-0 flex-1">{summary}</div>
      </button>
      {expanded ? (
        <div className="grid gap-3 border-t border-border px-3 py-3">
          {children}
        </div>
      ) : null}
    </ListItem>
  );
}

/** Labeled value inside an expanded row's details area. */
export function DetailField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-black uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <div className="break-words text-xs font-medium text-foreground/80">
        {children}
      </div>
    </div>
  );
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

/**
 * Cursor-paginated, searchable, infinite-scrolling list card. Feed it a
 * fetchPage(cursor, search) and a row renderer; external filters plug in via
 * extraFilters/actions slots and extraKey (restarts pagination on change).
 */
export function CursorListPanel<TItem extends { id: string }>({
  actions,
  countNoun,
  emptyFilteredMessage = "Nenhum registro corresponde aos filtros.",
  emptyMessage,
  extraFilters,
  extraKey = [],
  fetchPage,
  hasExtraFilters = false,
  queryKey,
  renderItem,
  searchPlaceholder,
  title,
}: {
  actions?: React.ReactNode;
  countNoun: string;
  emptyFilteredMessage?: string;
  emptyMessage: string;
  extraFilters?: React.ReactNode;
  extraKey?: unknown[];
  fetchPage: (input: {
    cursor: string | null;
    search: string;
  }) => Promise<{ items: TItem[]; next_cursor: string | null }>;
  hasExtraFilters?: boolean;
  queryKey: unknown[];
  renderItem: (item: TItem) => React.ReactNode;
  searchPlaceholder: string;
  title: React.ReactNode;
}) {
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput.trim());
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  const listQuery = useInfiniteQuery({
    queryKey: [...queryKey, ...extraKey, search],
    queryFn: ({ pageParam }) => fetchPage({ cursor: pageParam, search }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    retry: false,
  });

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;

  useInfiniteScrollSentinel({
    fetchNextPage,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    itemCount: items.length,
    scrollRef,
    sentinelRef,
  });

  return (
    <SectionCard
      title={title}
      description={`${formatNumber(items.length)} ${countNoun} carregado(s)`}
      actions={actions}
      contentClassName="gap-0 p-0 sm:p-0"
    >
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:px-6 sm:py-4">
        {extraFilters}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 bg-card pl-9 text-sm"
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="grid max-h-scroll-panel gap-2 overflow-y-auto p-4 sm:p-6"
      >
        {listQuery.isPending ? (
          <SkeletonList />
        ) : listQuery.error ? (
          <p className="text-sm font-medium text-destructive">
            Não foi possível carregar os registros.
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            message={
              search || hasExtraFilters ? emptyFilteredMessage : emptyMessage
            }
          />
        ) : (
          <>
            {items.map(renderItem)}
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage ? (
              <p className="py-1 text-center text-xs font-bold text-muted-foreground">
                Carregando mais...
              </p>
            ) : !hasNextPage && items.length > 0 ? (
              <p className="py-1 text-center text-xs font-medium text-muted-foreground/70">
                Fim da lista.
              </p>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}

/** Collapsible pretty-printed JSON viewer for settings/credentials blobs. */
export function JsonDetails({ label, value }: { label: string; value: unknown }) {
  const isEmpty =
    !value || (typeof value === "object" && Object.keys(value).length === 0);

  return (
    <details className="rounded-xl border border-border bg-muted/50">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-foreground/80">
        {label} {isEmpty ? "(vazio)" : ""}
      </summary>
      <pre className="overflow-x-auto border-t border-border p-4 text-xs text-foreground/80">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}
