import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The standard content section: titled card with a divided header, an
 * optional description and an optional actions slot (filters, buttons).
 * Compose freely inside — `contentClassName` adjusts the body layout
 * (e.g. "p-0" for full-bleed scroll areas).
 */
export function SectionCard({
  actions,
  children,
  contentClassName,
  description,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  description?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className={cn("grid gap-2 p-4 sm:p-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
