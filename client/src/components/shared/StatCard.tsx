import React from "react";
import { Card, CardContent } from "@/components/ui/card";

/** Compact metric tile: label, headline value, supporting detail line. */
export function StatCard({
  detail,
  icon: Icon,
  isLoading,
  label,
  value,
}: {
  detail?: string;
  icon?: React.ElementType;
  isLoading?: boolean;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        {Icon ? (
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-info-surface text-primary">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
        {isLoading ? (
          <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className="mt-1 text-section-title text-foreground">{value}</p>
        )}
        {detail ? (
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
