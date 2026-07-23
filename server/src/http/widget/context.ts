import { WidgetStore } from "./resolve-store";

/**
 * Server-side port of the widget.js page-context logic: URL/display rules,
 * product-page matching, video filtering and card-field resolution. The
 * embed script sends its page URL and the server answers with only the
 * videos to display (slim, render-ready) plus fully resolved config, so the
 * browser stops filtering, merging and formatting.
 *
 * Every function here mirrors a widget.js counterpart by name — keep the
 * semantics in lockstep or storefront behavior will drift between the old
 * cached embeds (which still filter client-side) and the new ones.
 */

export type PageContext = {
  pageUrl: string;
  origin: string;
  hostname: string;
  path: string;
  productUrl: string;
  externalProductId: string;
  rawWidgetType: string;
};

type SerializedVariant = Record<string, unknown>;
type SerializedProduct = Record<string, unknown> & {
  product_variants?: SerializedVariant[];
};
type SerializedVideoProduct = { is_primary?: boolean; products?: SerializedProduct | null };
export type SerializedVideo = Record<string, unknown> & {
  video_products?: SerializedVideoProduct[];
};

export type ResolvedWidgetConfig = {
  launcher: {
    position: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    label: string;
    font_family: string;
    bubble_size: number;
    model: string;
    offset_x: number;
    offset_y: number;
    border_radius: number;
    shadow_enabled: boolean;
    shadow_color: string;
    shadow_opacity: number;
    shadow_blur: number;
  };
  display: {
    mode: string;
    product_mode: string;
    include_paths: string[];
    exclude_paths: string[];
    hide_without_videos: boolean;
    home_experience_enabled: boolean;
    home_ordering: string;
  };
  carousel: {
    enabled: boolean;
    title: string;
    description: string;
    before_heading: string;
    anchor_selector: string;
    anchor_placement: string;
    anchor_fallback: string;
    max_items: number;
    mobile_max_items: number;
    show_price: boolean;
    show_cart_actions: boolean;
    section_padding_x: number;
    section_padding_y: number;
    section_margin_x: number;
    section_margin_y: number;
    card_gap: number;
    show_scroll_hint: boolean;
    show_navigation_arrows: boolean;
    background_color: string;
    title_color: string;
    description_color: string;
    accent_color: string;
    font_source: string;
    font_family: string;
    show_title: boolean;
    show_description: boolean;
    card_border_radius: number;
    card_min_width: number;
    card_max_width: number;
    card_aspect_ratio: string;
    card_background_color: string;
    card_shadow_enabled: boolean;
    card_shadow_color: string;
    card_shadow_opacity: number;
    card_shadow_blur: number;
    card_shadow_offset_x: number;
    card_shadow_offset_y: number;
    pill_background_color: string;
    pill_text_color: string;
    nav_arrow_background_color: string;
    nav_arrow_icon_color: string;
    autoplay_enabled: boolean;
    autoplay_interval_ms: number;
    autoplay_direction: string;
    autoplay_pause_on_hover: boolean;
    autoplay_loop: boolean;
    disabled_reason?: string;
  };
};

import { CAROUSEL_PLAN_IDS, WIDGET_SETTINGS_DEFAULTS } from "@workspace/widget-config";
import { clean as text, asRecord as record } from "@/lib/text";

// ---------------------------------------------------------------------------
// URL / path helpers (widget.js: normalizePath, normalizeUrl, isHomePath,
// isLikelyProductPath, extractProductHandle, extractProductKey,
// hasProductVariantSegment)
// ---------------------------------------------------------------------------

export function normalizePath(value: unknown, base = "https://storefront.invalid"): string {
  let path = text(value) || "/";
  try {
    path = new URL(path, base).pathname;
  } catch {
    // keep raw value; the replaces below still normalize it
  }
  path = path.replace(/\/+/g, "/");
  if (path.length > 1) path = path.replace(/\/$/, "");
  return path || "/";
}

function normalizeUrl(value: unknown, base: string): string {
  try {
    const resolved = new URL(text(value), base);
    return (resolved.origin + normalizePath(resolved.pathname)).toLowerCase();
  } catch {
    return normalizePath(value).toLowerCase();
  }
}

function isUpzeroDevelopmentHomePath(path: string, hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return /^\/\d+\/?$/.test(normalizePath(path)) && /(^|\.)upzero\.com\.br$/.test(host);
}

function isHomePath(path: string, hostname: string): boolean {
  const normalized = normalizePath(path);
  return normalized === "/" || normalized === "" || isUpzeroDevelopmentHomePath(normalized, hostname);
}

function isLikelyProductPath(path: string): boolean {
  return /\/(produto|produtos|product|products)\//i.test(path);
}

function extractProductHandle(value: unknown): string {
  const path = normalizePath(value);
  const match = path.match(/\/(?:produto|produtos|product|products)\/([^/]+)/i);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

function extractProductKey(value: unknown): string {
  const handle = extractProductHandle(value);
  const refMatch = handle.match(/\bref\s*[:#-]?\s*(\d+[a-z0-9]*)/i);
  if (refMatch?.[1]) return `ref${refMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
  const compactRefMatch = handle.match(/\bref(\d+[a-z0-9]*)/i);
  if (compactRefMatch?.[1]) {
    return `ref${compactRefMatch[1].replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;
  }
  const numericPrefix = handle.match(/^\d+/);
  return numericPrefix ? numericPrefix[0] : handle;
}

function hasProductVariantSegment(value: unknown): boolean {
  return Boolean(
    normalizePath(value).match(/\/(?:produto|produtos|product|products)\/[^/]+\/[^/]+/i),
  );
}

function productPathKeysMatch(left: unknown, right: unknown): boolean {
  if (hasProductVariantSegment(right)) return false;
  const leftKey = extractProductKey(left);
  const rightKey = extractProductKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path).toLowerCase();
  const normalizedPattern = normalizePath(pattern).toLowerCase();
  if (!normalizedPattern || normalizedPattern === "/") return normalizedPath === "/";
  if (!normalizedPattern.includes("*")) {
    return (
      normalizedPath === normalizedPattern ||
      normalizedPath.startsWith(`${normalizedPattern}/`) ||
      productPathKeysMatch(normalizedPath, normalizedPattern)
    );
  }
  const expression = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${expression}$`).test(normalizedPath);
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

// ---------------------------------------------------------------------------
// Page context from the bootstrap query
// ---------------------------------------------------------------------------

export function buildPageContext(query: {
  url?: string;
  product_url?: string;
  external_product_id?: string;
  widget?: string;
}): PageContext | null {
  const pageUrl = text(query.url);
  if (!pageUrl) return null;
  let origin = "https://storefront.invalid";
  let hostname = "";
  let path = "/";
  try {
    const parsed = new URL(pageUrl);
    origin = parsed.origin;
    hostname = parsed.hostname;
    path = normalizePath(parsed.pathname);
  } catch {
    path = normalizePath(pageUrl);
  }
  return {
    pageUrl,
    origin,
    hostname,
    path,
    productUrl: text(query.product_url) || pageUrl,
    externalProductId: text(query.external_product_id),
    rawWidgetType: (text(query.widget) || "floating_launcher").replace(/-/g, "_"),
  };
}

// ---------------------------------------------------------------------------
// Config resolution (widget.js defaults + applyWidgetSettings)
// ---------------------------------------------------------------------------

const PLANS_WITH_HORIZONTAL_FEED: readonly string[] = CAROUSEL_PLAN_IDS;
const DEFAULTS = WIDGET_SETTINGS_DEFAULTS;

function parsePathList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveWidgetConfig(
  widget: { settings?: unknown } | null,
  store: WidgetStore,
): ResolvedWidgetConfig {
  const settings = record(widget?.settings);
  const appearance = record(settings.appearance);
  const display = record(settings.display);
  const carousel = record(settings.carousel);

  const resolved: ResolvedWidgetConfig = {
    launcher: {
      position: text(appearance.position) || DEFAULTS.appearance.position,
      accent_color: text(appearance.accent_color) || DEFAULTS.appearance.accent_color,
      background_color:
        text(appearance.background_color) || DEFAULTS.appearance.background_color,
      text_color: text(appearance.text_color) || DEFAULTS.appearance.text_color,
      label:
        typeof appearance.label === "string" ? appearance.label : DEFAULTS.appearance.label,
      font_family: text(appearance.font_family) || DEFAULTS.appearance.font_family,
      bubble_size: Number(appearance.bubble_size) || DEFAULTS.appearance.bubble_size,
      model: text(appearance.model) || DEFAULTS.appearance.model,
      offset_x: Number.isFinite(Number(appearance.offset_x))
        ? Number(appearance.offset_x)
        : DEFAULTS.appearance.offset_x,
      offset_y: Number.isFinite(Number(appearance.offset_y))
        ? Number(appearance.offset_y)
        : DEFAULTS.appearance.offset_y,
      border_radius: Number.isFinite(Number(appearance.border_radius))
        ? Number(appearance.border_radius)
        : DEFAULTS.appearance.border_radius,
      shadow_enabled:
        "shadow_enabled" in appearance
          ? appearance.shadow_enabled !== false
          : DEFAULTS.appearance.shadow_enabled,
      shadow_color: text(appearance.shadow_color) || DEFAULTS.appearance.shadow_color,
      shadow_opacity: Number.isFinite(Number(appearance.shadow_opacity))
        ? Number(appearance.shadow_opacity)
        : DEFAULTS.appearance.shadow_opacity,
      shadow_blur: Number.isFinite(Number(appearance.shadow_blur))
        ? Number(appearance.shadow_blur)
        : DEFAULTS.appearance.shadow_blur,
    },
    display: {
      mode: text(display.mode) || DEFAULTS.display.mode,
      product_mode: text(display.product_mode) || DEFAULTS.display.product_mode,
      include_paths: parsePathList(display.include_paths),
      exclude_paths: parsePathList(display.exclude_paths),
      hide_without_videos: Boolean(display.hide_without_videos),
      home_experience_enabled:
        "home_experience_enabled" in display ? display.home_experience_enabled !== false : true,
      home_ordering: text(display.home_ordering) || DEFAULTS.display.home_ordering,
    },
    carousel: {
      enabled: "enabled" in carousel ? carousel.enabled !== false : true,
      title:
        (typeof carousel.title === "string" && carousel.title) || DEFAULTS.carousel.title,
      description:
        typeof carousel.description === "string"
          ? carousel.description
          : DEFAULTS.carousel.description,
      before_heading:
        (typeof carousel.before_heading === "string" && carousel.before_heading) ||
        DEFAULTS.carousel.before_heading,
      anchor_selector: text(carousel.anchor_selector),
      anchor_placement:
        text(carousel.anchor_placement) || DEFAULTS.carousel.anchor_placement,
      anchor_fallback:
        text(carousel.anchor_fallback) || DEFAULTS.carousel.anchor_fallback,
      max_items: Number(carousel.max_items) || DEFAULTS.carousel.max_items,
      mobile_max_items:
        Number(carousel.mobile_max_items) || DEFAULTS.carousel.mobile_max_items,
      show_price: "show_price" in carousel ? carousel.show_price !== false : true,
      show_cart_actions:
        "show_cart_actions" in carousel ? carousel.show_cart_actions !== false : true,
      section_padding_x:
        Number(carousel.section_padding_x) || DEFAULTS.carousel.section_padding_x,
      section_padding_y:
        Number(carousel.section_padding_y) || DEFAULTS.carousel.section_padding_y,
      section_margin_x: Number.isFinite(Number(carousel.section_margin_x))
        ? Number(carousel.section_margin_x)
        : DEFAULTS.carousel.section_margin_x,
      section_margin_y: Number.isFinite(Number(carousel.section_margin_y))
        ? Number(carousel.section_margin_y)
        : DEFAULTS.carousel.section_margin_y,
      card_gap: Number.isFinite(Number(carousel.card_gap))
        ? Number(carousel.card_gap)
        : DEFAULTS.carousel.card_gap,
      show_scroll_hint:
        "show_scroll_hint" in carousel ? carousel.show_scroll_hint !== false : true,
      show_navigation_arrows:
        "show_navigation_arrows" in carousel ? carousel.show_navigation_arrows !== false : true,
      background_color: text(carousel.background_color) || DEFAULTS.carousel.background_color,
      title_color: text(carousel.title_color) || DEFAULTS.carousel.title_color,
      description_color: text(carousel.description_color) || DEFAULTS.carousel.description_color,
      // "" is meaningful (inherit the launcher's accent/font) — only swap in
      // the default when the field is missing entirely, not when it's "".
      accent_color: typeof carousel.accent_color === "string" ? carousel.accent_color : DEFAULTS.carousel.accent_color,
      font_source: text(carousel.font_source) || DEFAULTS.carousel.font_source,
      font_family: typeof carousel.font_family === "string" ? carousel.font_family : DEFAULTS.carousel.font_family,
      show_title: "show_title" in carousel ? carousel.show_title !== false : true,
      show_description: "show_description" in carousel ? carousel.show_description !== false : true,
      card_border_radius: Number.isFinite(Number(carousel.card_border_radius))
        ? Number(carousel.card_border_radius)
        : DEFAULTS.carousel.card_border_radius,
      card_min_width: Number(carousel.card_min_width) || DEFAULTS.carousel.card_min_width,
      card_max_width: Number(carousel.card_max_width) || DEFAULTS.carousel.card_max_width,
      card_aspect_ratio: text(carousel.card_aspect_ratio) || DEFAULTS.carousel.card_aspect_ratio,
      card_background_color:
        text(carousel.card_background_color) || DEFAULTS.carousel.card_background_color,
      card_shadow_enabled: Boolean(carousel.card_shadow_enabled),
      card_shadow_color: text(carousel.card_shadow_color) || DEFAULTS.carousel.card_shadow_color,
      card_shadow_opacity: Number.isFinite(Number(carousel.card_shadow_opacity))
        ? Number(carousel.card_shadow_opacity)
        : DEFAULTS.carousel.card_shadow_opacity,
      card_shadow_blur: Number.isFinite(Number(carousel.card_shadow_blur))
        ? Number(carousel.card_shadow_blur)
        : DEFAULTS.carousel.card_shadow_blur,
      card_shadow_offset_x: Number.isFinite(Number(carousel.card_shadow_offset_x))
        ? Number(carousel.card_shadow_offset_x)
        : DEFAULTS.carousel.card_shadow_offset_x,
      card_shadow_offset_y: Number.isFinite(Number(carousel.card_shadow_offset_y))
        ? Number(carousel.card_shadow_offset_y)
        : DEFAULTS.carousel.card_shadow_offset_y,
      pill_background_color:
        text(carousel.pill_background_color) || DEFAULTS.carousel.pill_background_color,
      pill_text_color: text(carousel.pill_text_color) || DEFAULTS.carousel.pill_text_color,
      nav_arrow_background_color:
        text(carousel.nav_arrow_background_color) ||
        DEFAULTS.carousel.nav_arrow_background_color,
      nav_arrow_icon_color:
        text(carousel.nav_arrow_icon_color) || DEFAULTS.carousel.nav_arrow_icon_color,
      autoplay_enabled: Boolean(carousel.autoplay_enabled),
      autoplay_interval_ms:
        Number(carousel.autoplay_interval_ms) || DEFAULTS.carousel.autoplay_interval_ms,
      autoplay_direction: text(carousel.autoplay_direction) || DEFAULTS.carousel.autoplay_direction,
      autoplay_pause_on_hover:
        "autoplay_pause_on_hover" in carousel ? carousel.autoplay_pause_on_hover !== false : true,
      autoplay_loop: "autoplay_loop" in carousel ? carousel.autoplay_loop !== false : true,
    },
  };

  if (!PLANS_WITH_HORIZONTAL_FEED.includes(text(store.plan_id).toLowerCase())) {
    resolved.carousel.enabled = false;
    resolved.carousel.disabled_reason = "plan_widget_limit";
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Display rules (widget.js shouldDisplayOnCurrentUrl)
// ---------------------------------------------------------------------------

function isHomeCarouselWidgetType(rawWidgetType: string): boolean {
  return (
    rawWidgetType === "home_carousel" ||
    rawWidgetType === "horizontal_feed" ||
    rawWidgetType === "home_video_carousel"
  );
}

function displayVerdict(
  config: ResolvedWidgetConfig,
  ctx: PageContext,
  videoCount: number,
  home: boolean,
): { show: boolean; reason: string } {
  if (matchesAnyPattern(ctx.path, config.display.exclude_paths)) {
    return { show: false, reason: "excluded_path" };
  }
  if (isHomeCarouselWidgetType(ctx.rawWidgetType)) {
    if (!home) return { show: false, reason: "carousel_outside_home" };
    if (!config.display.home_experience_enabled) {
      return { show: false, reason: "home_experience_disabled" };
    }
  } else if (home && !config.display.home_experience_enabled) {
    return { show: false, reason: "home_experience_disabled" };
  }
  if (isHomeCarouselWidgetType(ctx.rawWidgetType) && !config.carousel.enabled) {
    return { show: false, reason: config.carousel.disabled_reason || "carousel_disabled" };
  }
  if (config.display.hide_without_videos && videoCount === 0) {
    return { show: false, reason: "no_matching_videos" };
  }
  return { show: true, reason: "ok" };
}

export function resolveDisplay(
  config: ResolvedWidgetConfig,
  ctx: PageContext,
  videoCount: number,
): { show: boolean; reason: string; show_home_carousel: boolean } {
  const home = isHomePath(ctx.path, ctx.hostname);
  const verdict = displayVerdict(config, ctx, videoCount, home);
  const isFloating =
    ctx.rawWidgetType === "floating_launcher" || ctx.rawWidgetType === "floating_video";
  return {
    ...verdict,
    // Page-scoped: the embedded home carousel a floating widget injects
    // alongside the launcher renders only on the storefront home, with the
    // home experience on and the carousel plan-allowed. The client renders
    // this flag verbatim — it no longer evaluates home paths itself.
    show_home_carousel:
      verdict.show &&
      isFloating &&
      home &&
      config.display.home_experience_enabled &&
      config.carousel.enabled,
  };
}

// ---------------------------------------------------------------------------
// Video filtering (widget.js filterVideosForCurrentUrl + product matching)
// ---------------------------------------------------------------------------

function linkedProducts(video: SerializedVideo): SerializedProduct[] {
  return (video.video_products ?? [])
    .map((link) => link.products ?? null)
    .filter((product): product is SerializedProduct => Boolean(product));
}

function productMatchesPage(product: SerializedProduct, ctx: PageContext): boolean {
  const productUrl = text(product.product_url);
  if (!productUrl) return false;

  if (
    ctx.externalProductId &&
    product.external_id &&
    String(product.external_id) === ctx.externalProductId
  ) {
    return true;
  }

  if (normalizeUrl(ctx.productUrl, ctx.origin) === normalizeUrl(productUrl, ctx.origin)) return true;

  const currentProductPath = normalizePath(ctx.productUrl).toLowerCase();
  const savedProductPath = normalizePath(productUrl).toLowerCase();
  if (currentProductPath === savedProductPath) return true;

  const currentHandle = extractProductHandle(ctx.productUrl);
  const savedHandle = extractProductHandle(productUrl);
  return Boolean(
    (currentHandle && savedHandle && currentHandle === savedHandle) ||
      productPathKeysMatch(ctx.productUrl, productUrl),
  );
}

function videoVisibilityMatchesPage(video: SerializedVideo, ctx: PageContext): boolean | null {
  const visibilityUrl = text(video.product_visibility_url);
  if (!visibilityUrl) return null;
  return matchesPattern(ctx.path, visibilityUrl);
}

function videoMatchesCurrentProduct(video: SerializedVideo, ctx: PageContext): boolean {
  if (video.is_product_page_enabled === false) return false;
  if (video.product_visibility_scope === "variant") {
    const variantMatch = videoVisibilityMatchesPage(video, ctx);
    if (variantMatch !== null) return variantMatch;
  }
  return linkedProducts(video).some((product) => productMatchesPage(product, ctx));
}

export function filterVideosForContext(
  videos: SerializedVideo[],
  config: ResolvedWidgetConfig,
  ctx: PageContext,
): SerializedVideo[] {
  const matchingProductVideos = videos.filter((video) => videoMatchesCurrentProduct(video, ctx));
  const feedVideos = videos.filter((video) => video.is_feed_enabled !== false);
  const isProduct = config.display.mode === "product" || isLikelyProductPath(ctx.path);

  if (isProduct && matchingProductVideos.length) {
    const seen = new Set(matchingProductVideos.map((video) => video.id));
    return matchingProductVideos.concat(feedVideos.filter((video) => !seen.has(video.id)));
  }
  return feedVideos;
}

// ---------------------------------------------------------------------------
// Slim render-ready cards (widget.js productDisplayName / productImageUrl /
// productPriceLabel / formatProductPrice / videoMediaUrl)
// ---------------------------------------------------------------------------

function firstTextValue(values: unknown[], fallback = ""): string {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback;
}

function firstVariantTextValue(product: SerializedProduct | null, keys: string[]): string {
  const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
  for (const variant of variants) {
    for (const key of keys) {
      const value = (variant ?? {})[key];
      if (value !== undefined && value !== null && value !== "") return String(value);
    }
  }
  return "";
}

function isGenericProductName(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return !normalized || normalized === "produto" || normalized === "comprar produto";
}

function productDisplayName(product: SerializedProduct | null, video: SerializedVideo): string {
  let name = firstTextValue([product?.name, product?.title]);
  if (isGenericProductName(name)) name = "";
  return firstTextValue(
    [name, video.title, product?.external_id ? `Produto ${product.external_id}` : ""],
    "Produto",
  );
}

function productImageUrl(product: SerializedProduct | null, video: SerializedVideo): string {
  return firstTextValue([
    product?.image_url,
    product?.thumbnail_url,
    product?.image,
    product?.cover_url,
    firstVariantTextValue(product, ["image_url", "image", "thumbnail_url"]),
    video.thumbnail_url,
  ]);
}

export function formatProductPrice(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("R$") || raw.startsWith("$")) return raw;
  const normalized = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return "";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
  } catch {
    return `R$ ${number.toFixed(2).replace(".", ",")}`;
  }
}

function productPriceLabel(product: SerializedProduct | null): string {
  if (!product) return "";
  return formatProductPrice(
    product.price_promotional ||
      product.promotional_price ||
      product.sale_price ||
      product.price ||
      product.current_price ||
      firstVariantTextValue(product, [
        "price_promotional",
        "promotional_price",
        "sale_price",
        "price",
        "current_price",
      ]),
  );
}

export type SlimVideo = {
  id: unknown;
  title: unknown;
  media_url: string;
  thumbnail_url: string;
  product: {
    id: unknown;
    external_id: unknown;
    name: string;
    image_url: string;
    price_label: string;
    product_url: string;
  };
};

export function slimVideos(videos: SerializedVideo[]): SlimVideo[] {
  return videos.map((video) => {
    const product = linkedProducts(video)[0] ?? null;
    return {
      id: video.id,
      title: video.title,
      media_url: firstTextValue([video.video_url, video.playback_url]),
      thumbnail_url: text(video.thumbnail_url),
      // Card fields are always resolved, product or not — the old client fell
      // back to the video title/thumbnail for product-less videos and the
      // fallback chains live server-side now.
      product: {
        id: product?.id ?? null,
        external_id: product?.external_id ?? null,
        name: productDisplayName(product, video),
        image_url: productImageUrl(product, video),
        price_label: productPriceLabel(product),
        product_url: text(product?.product_url),
      },
    };
  });
}
