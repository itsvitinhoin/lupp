import React from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Labeled value that copies itself on click. `display` overrides what is
 * shown (e.g. a formatted date) while the raw `value` is what gets copied.
 * Renders a plain "—" (not clickable) when there is no value.
 */
export function CopyField({
  display,
  label,
  mono = true,
  value,
}: {
  display?: string;
  label: string;
  mono?: boolean;
  value?: string | number | null;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const raw = value === null || value === undefined ? "" : String(value);

  if (!raw) {
    return (
      <div className="min-w-0">
        <p className="text-2xs font-black uppercase tracking-wide text-muted-foreground/70">
          {label}
        </p>
        <p className="text-xs font-medium text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-2xs font-black uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <button
        type="button"
        title={`Copiar ${label.toLowerCase()}`}
        className={cn(
          "group inline-flex max-w-full items-center gap-1 break-all text-left text-xs font-medium",
          copied ? "text-success" : "text-foreground/80 hover:text-primary",
          mono && "font-mono",
        )}
        onClick={async (event) => {
          event.stopPropagation();
          try {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast({ title: "Não foi possível copiar o valor." });
          }
        }}
      >
        <span className="min-w-0">{display ?? raw}</span>
        {copied ? (
          <Check className="h-3 w-3 shrink-0" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}
