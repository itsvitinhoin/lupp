import React from "react";
import { cn } from "@/lib/utils";

/**
 * A soft inset row/panel used inside SectionCards for list entries.
 * "row" is the compact list entry; "panel" the roomier grouping block.
 */
export function ListItem({
  children,
  className,
  variant = "row",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "row" | "panel";
}) {
  return (
    <div
      className={cn(
        "border border-border bg-muted/50",
        variant === "row" ? "rounded-lg px-3 py-2" : "rounded-xl p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
