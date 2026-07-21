import { EmptyState } from "@/components/shared/EmptyState";
import { ListItem } from "@/components/shared/ListItem";
import { SectionCard } from "@/components/shared/SectionCard";
import type { AdminStoreDetail } from "@/types/admin-console";
import { formatDateTime } from "../shared";

export function ActivityTab({ detail }: { detail: AdminStoreDetail }) {
  return (
    <SectionCard title="Ações administrativas nesta loja">
      {detail.audit_logs.length === 0 ? (
        <EmptyState message="Nenhuma ação registrada para esta loja." />
      ) : (
        detail.audit_logs.map((log) => (
          <ListItem
            key={log.id}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-bold text-foreground">
                {log.action.replace(/_/g, " ")}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {log.admin_email || "admin"}
              </p>
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {formatDateTime(log.created_at)}
            </span>
          </ListItem>
        ))
      )}
    </SectionCard>
  );
}
