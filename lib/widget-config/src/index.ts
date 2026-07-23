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

/** Where the carousel lands when no anchor_selector is set or none matches. */
export const ANCHOR_FALLBACKS = ["top", "bottom"] as const;
export type AnchorFallback = (typeof ANCHOR_FALLBACKS)[number];

/** Plans allowed to render the home carousel (plan_widget_limit otherwise). */
export const CAROUSEL_PLAN_IDS = ["growth", "pro", "scale"] as const;

export const CAROUSEL_CARD_ASPECT_RATIOS = ["9:16", "4:5", "1:1", "3:4"] as const;
export type CarouselCardAspectRatio = (typeof CAROUSEL_CARD_ASPECT_RATIOS)[number];

export const CAROUSEL_AUTOPLAY_DIRECTIONS = ["forward", "backward"] as const;
export type CarouselAutoplayDirection = (typeof CAROUSEL_AUTOPLAY_DIRECTIONS)[number];

/**
 * "store" inherits the storefront theme's own font (CSS `inherit` — the
 * carousel is inserted directly into the page DOM, so this picks up
 * whatever font-family cascades from the theme, no detection needed);
 * "launcher" matches the floating launcher's configured font; "custom" uses
 * carousel.font_family verbatim.
 */
export const CAROUSEL_FONT_SOURCES = ["store", "launcher", "custom"] as const;
export type CarouselFontSource = (typeof CAROUSEL_FONT_SOURCES)[number];

export const BUBBLE_SIZE_RANGE = { min: 48, max: 120 } as const;
export const OFFSET_RANGE = { min: 0, max: 120 } as const;
export const CAROUSEL_ITEMS_RANGE = { min: 1, max: 24 } as const;
/** section_padding_x/y and section_margin_x/y, in px. */
export const CAROUSEL_SPACING_RANGE = { min: 0, max: 120 } as const;
/** Gap between product cards, in px. */
export const CAROUSEL_CARD_GAP_RANGE = { min: 0, max: 80 } as const;
/** card_min_width/card_max_width, in px. */
export const CAROUSEL_CARD_WIDTH_RANGE = { min: 120, max: 360 } as const;
export const CAROUSEL_CARD_RADIUS_RANGE = { min: 0, max: 40 } as const;
export const CAROUSEL_CARD_SHADOW_OPACITY_RANGE = { min: 0, max: 100 } as const;
export const CAROUSEL_CARD_SHADOW_BLUR_RANGE = { min: 0, max: 80 } as const;
export const CAROUSEL_CARD_SHADOW_OFFSET_RANGE = { min: -40, max: 40 } as const;
/** Time between auto-advances, in ms. */
export const CAROUSEL_AUTOPLAY_INTERVAL_RANGE = { min: 1500, max: 15000 } as const;

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
  anchor_fallback: AnchorFallback;
  max_items: number;
  mobile_max_items: number;
  show_price: boolean;
  show_cart_actions: boolean;
  // Layout: spacing is inside the section (edge padding), margin is outside
  // it (space between the carousel block and whatever the page renders
  // before/after it).
  section_padding_x: number;
  section_padding_y: number;
  section_margin_x: number;
  section_margin_y: number;
  card_gap: number;
  show_scroll_hint: boolean;
  show_navigation_arrows: boolean;
  // Appearance. accent_color defaults to "" (empty), meaning "inherit the
  // launcher's". font_family is only read when font_source is "custom".
  background_color: string;
  title_color: string;
  description_color: string;
  accent_color: string;
  font_source: CarouselFontSource;
  font_family: string;
  show_title: boolean;
  show_description: boolean;
  // Product card.
  card_border_radius: number;
  card_min_width: number;
  card_max_width: number;
  card_aspect_ratio: CarouselCardAspectRatio;
  card_background_color: string;
  card_shadow_enabled: boolean;
  card_shadow_color: string;
  /** 0-100, percent opacity. */
  card_shadow_opacity: number;
  card_shadow_blur: number;
  card_shadow_offset_x: number;
  card_shadow_offset_y: number;
  // Auto-scroll. Disabled by default — existing stores must not suddenly
  // start auto-scrolling. The widget additionally never auto-scrolls for a
  // visitor with prefers-reduced-motion, regardless of this setting.
  autoplay_enabled: boolean;
  autoplay_interval_ms: number;
  autoplay_direction: CarouselAutoplayDirection;
  autoplay_pause_on_hover: boolean;
  autoplay_loop: boolean;
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
    // Previously the widget silently landed at the very top of <main> when no
    // anchor matched (reported as "the carousel stays on top" on Shopify
    // themes whose DOM doesn't match any known heuristic) — bottom is the
    // safer default; anchor_selector/anchor_placement still take priority
    // whenever they resolve to a real element.
    anchor_fallback: "bottom",
    max_items: 12,
    mobile_max_items: 6,
    show_price: true,
    show_cart_actions: true,
    section_padding_x: 16,
    section_padding_y: 24,
    section_margin_x: 0,
    section_margin_y: 0,
    card_gap: 18,
    show_scroll_hint: true,
    show_navigation_arrows: true,
    background_color: "#ffffff",
    title_color: "#202124",
    description_color: "#64748b",
    accent_color: "",
    font_source: "store",
    font_family: "",
    show_title: true,
    show_description: true,
    card_border_radius: 12,
    card_min_width: 178,
    card_max_width: 250,
    card_aspect_ratio: "9:16",
    card_background_color: "#f3f4f6",
    // Off by default — a plain box-shadow drop under every card read as an
    // unwanted gray smear on real storefronts; merchants who want one can
    // now opt in and tune it instead of it being baked in unconditionally.
    card_shadow_enabled: false,
    card_shadow_color: "#0f172a",
    card_shadow_opacity: 12,
    card_shadow_blur: 28,
    card_shadow_offset_x: 0,
    card_shadow_offset_y: 14,
    autoplay_enabled: false,
    autoplay_interval_ms: 3500,
    autoplay_direction: "forward",
    autoplay_pause_on_hover: true,
    autoplay_loop: true,
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
      anchor_fallback: oneOf(
        carousel.anchor_fallback,
        ANCHOR_FALLBACKS,
        base.carousel.anchor_fallback,
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
      show_price: bool(carousel.show_price, base.carousel.show_price),
      show_cart_actions: bool(carousel.show_cart_actions, base.carousel.show_cart_actions),
      section_padding_x: clampedNumber(
        carousel.section_padding_x,
        CAROUSEL_SPACING_RANGE,
        base.carousel.section_padding_x,
      ),
      section_padding_y: clampedNumber(
        carousel.section_padding_y,
        CAROUSEL_SPACING_RANGE,
        base.carousel.section_padding_y,
      ),
      section_margin_x: clampedNumber(
        carousel.section_margin_x,
        CAROUSEL_SPACING_RANGE,
        base.carousel.section_margin_x,
      ),
      section_margin_y: clampedNumber(
        carousel.section_margin_y,
        CAROUSEL_SPACING_RANGE,
        base.carousel.section_margin_y,
      ),
      card_gap: clampedNumber(carousel.card_gap, CAROUSEL_CARD_GAP_RANGE, base.carousel.card_gap),
      show_scroll_hint: bool(carousel.show_scroll_hint, base.carousel.show_scroll_hint),
      show_navigation_arrows: bool(
        carousel.show_navigation_arrows,
        base.carousel.show_navigation_arrows,
      ),
      background_color: color(carousel.background_color, base.carousel.background_color),
      title_color: color(carousel.title_color, base.carousel.title_color),
      description_color: color(carousel.description_color, base.carousel.description_color),
      // "" is a valid, meaningful value here (inherit the launcher's) —
      // color()/text() would reject it and fall back to base, so accept an
      // explicit empty string as-is instead of coercing it away.
      accent_color:
        carousel.accent_color === ""
          ? ""
          : color(carousel.accent_color, base.carousel.accent_color),
      font_source: oneOf(carousel.font_source, CAROUSEL_FONT_SOURCES, base.carousel.font_source),
      font_family:
        typeof carousel.font_family === "string"
          ? carousel.font_family
          : base.carousel.font_family,
      show_title: bool(carousel.show_title, base.carousel.show_title),
      show_description: bool(carousel.show_description, base.carousel.show_description),
      card_border_radius: clampedNumber(
        carousel.card_border_radius,
        CAROUSEL_CARD_RADIUS_RANGE,
        base.carousel.card_border_radius,
      ),
      card_min_width: clampedNumber(
        carousel.card_min_width,
        CAROUSEL_CARD_WIDTH_RANGE,
        base.carousel.card_min_width,
      ),
      card_max_width: clampedNumber(
        carousel.card_max_width,
        CAROUSEL_CARD_WIDTH_RANGE,
        base.carousel.card_max_width,
      ),
      card_aspect_ratio: oneOf(
        carousel.card_aspect_ratio,
        CAROUSEL_CARD_ASPECT_RATIOS,
        base.carousel.card_aspect_ratio,
      ),
      card_background_color: color(
        carousel.card_background_color,
        base.carousel.card_background_color,
      ),
      card_shadow_enabled: bool(carousel.card_shadow_enabled, base.carousel.card_shadow_enabled),
      card_shadow_color: color(carousel.card_shadow_color, base.carousel.card_shadow_color),
      card_shadow_opacity: clampedNumber(
        carousel.card_shadow_opacity,
        CAROUSEL_CARD_SHADOW_OPACITY_RANGE,
        base.carousel.card_shadow_opacity,
      ),
      card_shadow_blur: clampedNumber(
        carousel.card_shadow_blur,
        CAROUSEL_CARD_SHADOW_BLUR_RANGE,
        base.carousel.card_shadow_blur,
      ),
      card_shadow_offset_x: clampedNumber(
        carousel.card_shadow_offset_x,
        CAROUSEL_CARD_SHADOW_OFFSET_RANGE,
        base.carousel.card_shadow_offset_x,
      ),
      card_shadow_offset_y: clampedNumber(
        carousel.card_shadow_offset_y,
        CAROUSEL_CARD_SHADOW_OFFSET_RANGE,
        base.carousel.card_shadow_offset_y,
      ),
      autoplay_enabled: bool(carousel.autoplay_enabled, base.carousel.autoplay_enabled),
      autoplay_interval_ms: clampedNumber(
        carousel.autoplay_interval_ms,
        CAROUSEL_AUTOPLAY_INTERVAL_RANGE,
        base.carousel.autoplay_interval_ms,
      ),
      autoplay_direction: oneOf(
        carousel.autoplay_direction,
        CAROUSEL_AUTOPLAY_DIRECTIONS,
        base.carousel.autoplay_direction,
      ),
      autoplay_pause_on_hover: bool(
        carousel.autoplay_pause_on_hover,
        base.carousel.autoplay_pause_on_hover,
      ),
      autoplay_loop: bool(carousel.autoplay_loop, base.carousel.autoplay_loop),
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
