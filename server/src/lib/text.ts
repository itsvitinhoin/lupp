/**
 * Tiny coercion helpers used across route handlers. These were re-defined
 * per-file (clean/asRecord in ~10 files) — import from here instead of
 * copying; keep them dependency-free.
 */

/** Trims any value into a string ("" for null/undefined). */
export function clean(value: unknown): string {
  return String(value || "").trim();
}

/** Narrows to a plain object record; anything else becomes {}. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
