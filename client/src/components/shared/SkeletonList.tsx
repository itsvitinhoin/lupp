import { cn } from "@/lib/utils";

/** Pulse placeholders matching ListItem rows while a list loads. */
export function SkeletonList({
  count = 4,
  itemClassName,
}: {
  count?: number;
  itemClassName?: string;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cn(
            "h-16 animate-pulse rounded-lg border border-border bg-muted/50",
            itemClassName,
          )}
        />
      ))}
    </>
  );
}
