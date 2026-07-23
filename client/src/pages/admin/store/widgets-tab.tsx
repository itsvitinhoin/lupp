import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import type { AdminStoreDetail } from "@/types/admin-console";
import { FeedManager } from "@/pages/feed";
import { WidgetsManager } from "@/pages/widgets";
import { formatDate, statusTone } from "../shared";
import { RunAdminAction } from "./shared";

// The rich editors (WidgetsManager/FeedManager) manage their own data
// fetching and mutations directly against /api/widgets — the same
// components /app/widgets and /app/feed use for a store's own logged-in
// user, just given the admin's arbitrary store instead of useCurrentStore().
// isActing/onAction stay in the signature for the other cards on this tab
// (domains/custom pages are read-only today, kept for a future action).
export function WidgetsTab({
  detail,
}: {
  detail: AdminStoreDetail;
  isActing: boolean;
  onAction: RunAdminAction;
}) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Widget flutuante e Feed Horizontal"
        description="Mesmo editor de /app/widgets, aplicado a esta loja."
      >
        <WidgetsManager store={detail.store} />
      </SectionCard>
      <SectionCard
        title="Feed vertical"
        description="Mesmo editor de /app/feed, aplicado a esta loja."
      >
        <FeedManager store={detail.store} />
      </SectionCard>
      <div className="grid gap-6 xl:grid-cols-2">
        <DomainsCard detail={detail} />
        <CustomPagesCard detail={detail} />
      </div>
    </div>
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
