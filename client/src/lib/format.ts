/** pt-BR display formatters shared across the dashboard and admin console. */

export function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

export function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value?: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Bytes -> "1.2 GB" style label, base-1024, 0 decimals under 10 of a unit. */
export function formatBytes(value: number | string | bigint | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const scaled = bytes / 1024 ** exponent;
  return `${scaled.toFixed(scaled < 10 ? 1 : 0)} ${units[exponent]}`;
}

/** Up to two uppercase initials for avatar placeholders ("Loja Um" → "LU"). */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LP"
  );
}
