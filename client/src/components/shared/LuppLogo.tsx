import { cn } from "@/lib/utils";

/**
 * Application wordmark. "adaptive" (default) follows the active theme: the
 * blue artwork is flattened to solid white in dark mode via CSS filters, so
 * geometry is identical in both themes (no layout shift, no second asset).
 * Use "brand" on deliberately always-light surfaces (landing, public pages,
 * storefront previews) to keep the original colors.
 */
export function LuppLogo({
  className = "",
  variant = "adaptive",
}: {
  className?: string;
  variant?: "adaptive" | "brand";
}) {
  return (
    <img
      src="/luup-logo-blue.png"
      alt="Luup"
      className={cn(
        "h-9 w-auto object-contain",
        variant === "adaptive" && "dark:brightness-0 dark:invert",
        className,
      )}
    />
  );
}
