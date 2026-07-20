/**
 * Single source of truth for the widget settings contract shared by the
 * dashboard (client), the API (server write path) and the bootstrap resolver.
 * Pure TypeScript on purpose: the client pins zod v3 and the server zod v4,
 * so validation here is hand-rolled coercion instead of a schema library.
 *
 * The defaults below are the values `resolveWidgetConfig` (server) and
 * `SCRIPT_VALUE_SPECS` (widget runtime) already ship — changing one here
 * changes what un-configured stores render, so treat edits as behavioral.
 */

export const LAUNCHER_POSITIONS = [
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
] as const;
export type LauncherPosition = (typeof LAUNCHER_POSITIONS)[number];

export const LAUNCHER_MODELS = [
  "rectangular",
  "square",
  "circular",
  "circular_text",
  "highlight",
  "insta",
  "insta_neon",
] as const;
export type LauncherModel = (typeof LAUNCHER_MODELS)[number];

export const DISPLAY_MODES = ["all", "product"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const PRODUCT_MODES = ["linked_or_all", "linked_only", "all"] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];

export const HOME_ORDERINGS = ["manual", "automatic"] as const;
export type HomeOrdering = (typeof HOME_ORDERINGS)[number];

export const ANCHOR_PLACEMENTS = ["before", "after"] as const;
export type AnchorPlacement = (typeof ANCHOR_PLACEMENTS)[number];

/** Plans allowed to render the home carousel (plan_widget_limit otherwise). */
export const CAROUSEL_PLAN_IDS = ["growth", "pro", "scale"] as const;

export const BUBBLE_SIZE_RANGE = { min: 48, max: 120 } as const;
export const OFFSET_RANGE = { min: 0, max: 120 } as const;
export const CAROUSEL_ITEMS_RANGE = { min: 1, max: 24 } as const;

export type WidgetAppearanceSettings = {
  position: LauncherPosition;
  accent_color: string;
  background_color: string;
  text_color: string;
  label: string;
  font_family: string;
  bubble_size: number;
  model: LauncherModel;
  offset_x: number;
  offset_y: number;
};

export type WidgetDisplaySettings = {
  mode: DisplayMode;
  product_mode: ProductMode;
  include_paths: string[];
  exclude_paths: string[];
  hide_without_videos: boolean;
  home_experience_enabled: boolean;
  home_ordering: HomeOrdering;
};

export type WidgetCarouselSettings = {
  enabled: boolean;
  title: string;
  description: string;
  before_heading: string;
  anchor_selector: string;
  anchor_placement: AnchorPlacement;
  max_items: number;
  mobile_max_items: number;
};

export type WidgetSettings = {
  appearance: WidgetAppearanceSettings;
  display: WidgetDisplaySettings;
  carousel: WidgetCarouselSettings;
};

export const WIDGET_SETTINGS_DEFAULTS: WidgetSettings = {
  appearance: {
    position: "bottom-left",
    accent_color: "#fe2c55",
    background_color: "#0b0b0f",
    text_color: "#ffffff",
    label: "Compre pelo vídeo",
    font_family:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    bubble_size: 74,
    model: "circular",
    offset_x: 18,
    offset_y: 18,
  },
  display: {
    mode: "all",
    product_mode: "linked_or_all",
    include_paths: [],
    exclude_paths: ["/checkout", "/carrinho", "/cart"],
    hide_without_videos: false,
    home_experience_enabled: true,
    home_ordering: "manual",
  },
  carousel: {
    enabled: true,
    title: "Descubra cada detalhe e Compre",
    description: "",
    before_heading: "Com Capa",
    anchor_selector: "",
    anchor_placement: "before",
    max_items: 12,
    mobile_max_items: 6,
  },
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function clampedNumber(
  value: unknown,
  range: { min: number; max: number },
  fallback: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(parsed)));
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function color(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR.test(candidate) ? candidate : fallback;
}

export function pathList(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") continue;
    let trimmed = item.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("/")) trimmed = `/${trimmed}`;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      paths.push(trimmed);
    }
  }
  return paths;
}

/**
 * Coerce an untrusted settings object into the typed contract, falling back
 * to `base` (defaults, or the stored settings during a merge) per field.
 * Unknown keys inside each section are preserved (loose passthrough — extra
 * row fields must keep flowing, per the server's response conventions).
 */
export function normalizeWidgetSettings(
  input: unknown,
  base: WidgetSettings = WIDGET_SETTINGS_DEFAULTS,
): WidgetSettings & UnknownRecord {
  const raw = asRecord(input);
  const appearance = asRecord(raw.appearance);
  const display = asRecord(raw.display);
  const carousel = asRecord(raw.carousel);

  return {
    ...raw,
    appearance: {
      ...appearance,
      position: oneOf(appearance.position, LAUNCHER_POSITIONS, base.appearance.position),
      accent_color: color(appearance.accent_color, base.appearance.accent_color),
      background_color: color(
        appearance.background_color,
        base.appearance.background_color,
      ),
      text_color: color(appearance.text_color, base.appearance.text_color),
      label: text(appearance.label, base.appearance.label),
      font_family: text(appearance.font_family, base.appearance.font_family),
      bubble_size: clampedNumber(
        appearance.bubble_size,
        BUBBLE_SIZE_RANGE,
        base.appearance.bubble_size,
      ),
      model: oneOf(appearance.model, LAUNCHER_MODELS, base.appearance.model),
      offset_x: clampedNumber(appearance.offset_x, OFFSET_RANGE, base.appearance.offset_x),
      offset_y: clampedNumber(appearance.offset_y, OFFSET_RANGE, base.appearance.offset_y),
    },
    display: {
      ...display,
      mode: oneOf(display.mode, DISPLAY_MODES, base.display.mode),
      product_mode: oneOf(display.product_mode, PRODUCT_MODES, base.display.product_mode),
      include_paths:
        display.include_paths === undefined
          ? [...base.display.include_paths]
          : pathList(display.include_paths),
      exclude_paths:
        display.exclude_paths === undefined
          ? [...base.display.exclude_paths]
          : pathList(display.exclude_paths),
      hide_without_videos: bool(
        display.hide_without_videos,
        base.display.hide_without_videos,
      ),
      home_experience_enabled: bool(
        display.home_experience_enabled,
        base.display.home_experience_enabled,
      ),
      home_ordering: oneOf(display.home_ordering, HOME_ORDERINGS, base.display.home_ordering),
    },
    carousel: {
      ...carousel,
      enabled: bool(carousel.enabled, base.carousel.enabled),
      title: text(carousel.title, base.carousel.title),
      description: typeof carousel.description === "string" ? carousel.description : base.carousel.description,
      before_heading: text(carousel.before_heading, base.carousel.before_heading),
      anchor_selector:
        typeof carousel.anchor_selector === "string"
          ? carousel.anchor_selector.trim()
          : base.carousel.anchor_selector,
      anchor_placement: oneOf(
        carousel.anchor_placement,
        ANCHOR_PLACEMENTS,
        base.carousel.anchor_placement,
      ),
      max_items: clampedNumber(
        carousel.max_items,
        CAROUSEL_ITEMS_RANGE,
        base.carousel.max_items,
      ),
      mobile_max_items: clampedNumber(
        carousel.mobile_max_items,
        CAROUSEL_ITEMS_RANGE,
        base.carousel.mobile_max_items,
      ),
    },
  };
}

/**
 * Section-wise merge for PATCH semantics: incoming keys win inside each of
 * appearance/display/carousel, stored keys survive when the patch omits them,
 * and top-level unknown sections from both sides pass through (incoming wins).
 */
export function mergeWidgetSettings(
  stored: unknown,
  incoming: unknown,
): WidgetSettings & UnknownRecord {
  const storedRecord = asRecord(stored);
  const incomingRecord = asRecord(incoming);
  const base = normalizeWidgetSettings(storedRecord);

  const patched: UnknownRecord = { ...storedRecord, ...incomingRecord };
  for (const section of ["appearance", "display", "carousel"] as const) {
    patched[section] = {
      ...asRecord(storedRecord[section]),
      ...asRecord(incomingRecord[section]),
    };
  }
  return normalizeWidgetSettings(patched, base);
}
