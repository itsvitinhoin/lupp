// Lupp widget – embed configuration surface: every data-* attribute /
// script-src query alias / default the storefront <script> tag can set, plus
// the precedence rules that reconcile them with the server-resolved
// dashboard settings.
//
// SCRIPT_VALUE_SPECS is a public embed contract: attribute/query names and
// defaults are already live on installed embeds — add fields freely, never
// rename or remove one. client/src/lib/widget-embed.ts (the dashboard's
// generated snippet) must stay in lockstep with whatever subset it emits.
import { readQueryValue } from "../utils";
import { ctx } from "../context";
import type {
  CarouselConfig,
  CarouselServerConfig,
  ContextConfig,
  DisplayConfig,
  DisplayServerConfig,
  LauncherConfig,
  LauncherServerConfig,
} from "../types";

export interface ScriptValueSpec {
  attr: string;
  query: string[];
  def: string;
}

export const SCRIPT_VALUE_SPECS = {
  storeId: { attr: "data-store-id", query: ["lupp_store_id", "store_id"], def: "" },
  storeSlug: { attr: "data-store", query: ["lupp_store", "lupp_store_slug", "store_slug"], def: "" },
  widgetType: { attr: "data-widget", query: ["lupp_widget", "widget"], def: "floating_launcher" },
  nubesdkFrameMode: { attr: "data-nubesdk-frame", query: ["lupp_nubesdk_frame"], def: "" },
  productUrl: { attr: "data-product-url", query: ["lupp_product_url", "product_url"], def: "" },
  productId: { attr: "data-product-id", query: ["lupp_product_id", "product_id", "external_product_id", "lupp_external_product_id"], def: "" },
  apiUrl: { attr: "data-api-url", query: ["lupp_api_url", "api_url"], def: "" },
  luppUrl: { attr: "data-lupp-url", query: ["lupp_url", "lupp_base_url"], def: "" },
  requireActive: { attr: "data-require-active", query: ["lupp_require_active", "require_active"], def: "false" },
  externalStoreId: { attr: "data-external-store-id", query: ["external_store_id", "lupp_external_store_id", "nuvemshop_store_id", "store"], def: "" },
  storeDomain: { attr: "data-store-domain", query: ["store_domain", "lupp_store_domain", "domain", "hostname"], def: "" },
  position: { attr: "data-position", query: ["lupp_position"], def: "bottom-left" },
  accentColor: { attr: "data-accent-color", query: ["lupp_accent_color"], def: "#fe2c55" },
  backgroundColor: { attr: "data-background-color", query: ["lupp_background_color"], def: "#0b0b0f" },
  textColor: { attr: "data-text-color", query: ["lupp_text_color"], def: "#ffffff" },
  label: { attr: "data-label", query: ["lupp_label"], def: "Compre pelo vídeo" },
  fontFamily: { attr: "data-font-family", query: ["lupp_font_family"], def: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  bubbleSize: { attr: "data-bubble-size", query: ["lupp_bubble_size"], def: "74" },
  model: { attr: "data-model", query: ["lupp_model"], def: "circular" },
  offsetX: { attr: "data-offset-x", query: ["lupp_offset_x"], def: "18" },
  offsetY: { attr: "data-offset-y", query: ["lupp_offset_y"], def: "18" },
  hideWithoutVideos: { attr: "data-hide-without-videos", query: ["lupp_hide_without_videos"], def: "false" },
  homeExperienceEnabled: { attr: "data-home-experience-enabled", query: ["lupp_home_experience_enabled"], def: "true" },
  carouselTitle: { attr: "data-carousel-title", query: ["lupp_carousel_title"], def: "Descubra cada detalhe e Compre" },
  carouselDescription: { attr: "data-carousel-description", query: ["lupp_carousel_description"], def: "" },
  homeCarouselEnabled: { attr: "data-home-carousel-enabled", query: ["lupp_home_carousel_enabled"], def: "true" },
  carouselBeforeHeading: { attr: "data-carousel-before-heading", query: ["lupp_carousel_before_heading"], def: "Com Capa" },
  carouselAnchorSelector: { attr: "data-carousel-anchor-selector", query: ["lupp_carousel_anchor_selector"], def: "" },
  carouselAnchorPlacement: { attr: "data-carousel-anchor-placement", query: ["lupp_carousel_anchor_placement"], def: "before" },
  carouselAnchorFallback: { attr: "data-carousel-anchor-fallback", query: ["lupp_carousel_anchor_fallback"], def: "bottom" },
  carouselMaxItems: { attr: "data-carousel-max-items", query: ["lupp_carousel_max_items"], def: "12" },
  carouselMobileMaxItems: { attr: "data-carousel-mobile-max-items", query: ["lupp_carousel_mobile_max_items"], def: "6" },
  carouselShowPrice: { attr: "data-carousel-show-price", query: ["lupp_carousel_show_price"], def: "true" },
  carouselShowCartActions: { attr: "data-carousel-show-cart-actions", query: ["lupp_carousel_show_cart_actions"], def: "true" },
  loadStrategy: { attr: "data-load-strategy", query: ["lupp_load_strategy"], def: "idle" },
  previewMode: { attr: "data-preview-mode", query: ["lupp_preview_mode"], def: "balanced" },
} satisfies Record<string, ScriptValueSpec>;

export type EmbedValueKey = keyof typeof SCRIPT_VALUE_SPECS;
export type RawEmbedValues = Record<EmbedValueKey, string>;

function readScriptQueryValue(script: HTMLScriptElement, name: string): string | null {
  return readQueryValue(script.src || "", name);
}

export function readScriptValue(script: HTMLScriptElement, spec: ScriptValueSpec): string {
  const attributeValue = script.getAttribute(spec.attr);
  if (attributeValue !== null && attributeValue !== "") return attributeValue;
  for (const queryName of spec.query) {
    const queryValue = readScriptQueryValue(script, queryName);
    if (queryValue !== null && queryValue !== "") return queryValue;
  }
  return spec.def;
}

// True when the embed set this value explicitly on the script tag (data-*
// attribute or script-src query param). Explicit embed values outrank the
// dashboard-configured settings echoed back by the server.
export function hasExplicitScriptValue(script: HTMLScriptElement, spec: ScriptValueSpec): boolean {
  const attributeValue = script.getAttribute(spec.attr);
  if (attributeValue !== null && attributeValue !== "") return true;
  for (const queryName of spec.query) {
    const queryValue = readScriptQueryValue(script, queryName);
    if (queryValue !== null && queryValue !== "") return true;
  }
  return false;
}

// One pass over the table resolves every raw (string) embed value.
export function readAllRawEmbedValues(script: HTMLScriptElement): RawEmbedValues {
  const raw = {} as RawEmbedValues;
  (Object.keys(SCRIPT_VALUE_SPECS) as EmbedValueKey[]).forEach((key) => {
    raw[key] = readScriptValue(script, SCRIPT_VALUE_SPECS[key]);
  });
  return raw;
}

export function buildLauncherConfig(raw: RawEmbedValues): LauncherConfig {
  return {
    position: raw.position,
    accentColor: raw.accentColor,
    backgroundColor: raw.backgroundColor,
    textColor: raw.textColor,
    label: raw.label,
    fontFamily: raw.fontFamily,
    bubbleSize: Number(raw.bubbleSize),
    model: raw.model,
    offsetX: Number(raw.offsetX),
    offsetY: Number(raw.offsetY),
    // Dashboard-only, no data-*/query override (same precedent as the
    // carousel's own shadow/layout fields below) — bootstrap always
    // supplies the resolved value once it answers.
    borderRadius: -1,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 28,
    shadowBlur: 28,
  };
}

// Path/product display rules are evaluated server-side in context mode; only
// the flags the client still acts on locally remain here.
export function buildDisplayConfig(raw: RawEmbedValues): DisplayConfig {
  return {
    hideWithoutVideos: raw.hideWithoutVideos === "true",
    homeExperienceEnabled: raw.homeExperienceEnabled !== "false",
  };
}

// Layout/appearance/card/autoplay fields below have no data-*/query embed
// override (dashboard-only) — these seed values match
// @workspace/widget-config's WIDGET_SETTINGS_DEFAULTS.carousel exactly, and
// applyContextConfig always overwrites them once bootstrap resolves (no
// hasExplicitScriptValue check needed, since there's no explicit value to
// check for).
export function buildCarouselConfig(raw: RawEmbedValues): CarouselConfig {
  return {
    title: raw.carouselTitle,
    description: raw.carouselDescription,
    enabled: raw.homeCarouselEnabled !== "false",
    beforeHeading: raw.carouselBeforeHeading,
    anchorSelector: raw.carouselAnchorSelector,
    anchorPlacement: raw.carouselAnchorPlacement,
    anchorFallback: raw.carouselAnchorFallback,
    maxItems: Number(raw.carouselMaxItems) || 12,
    mobileMaxItems: Number(raw.carouselMobileMaxItems) || 6,
    showPrice: raw.carouselShowPrice !== "false",
    showCartActions: raw.carouselShowCartActions !== "false",
    sectionPaddingX: 16,
    sectionPaddingY: 24,
    sectionMarginX: 0,
    sectionMarginY: 0,
    cardGap: 18,
    showScrollHint: true,
    showNavigationArrows: true,
    backgroundColor: "#ffffff",
    titleColor: "#202124",
    descriptionColor: "#64748b",
    accentColor: "",
    fontSource: "store",
    fontFamily: "",
    showTitle: true,
    showDescription: true,
    cardBorderRadius: 12,
    cardMinWidth: 178,
    cardMaxWidth: 250,
    cardAspectRatio: "9:16",
    cardBackgroundColor: "#f3f4f6",
    cardShadowEnabled: false,
    cardShadowColor: "#0f172a",
    cardShadowOpacity: 12,
    cardShadowBlur: 28,
    cardShadowOffsetX: 0,
    cardShadowOffsetY: 14,
    pillBackgroundColor: "#485248",
    pillTextColor: "#ffffff",
    navArrowBackgroundColor: "#ffffff",
    navArrowIconColor: "#16171a",
    autoplayEnabled: false,
    autoplayIntervalMs: 3500,
    autoplayDirection: "forward",
    autoplayPauseOnHover: true,
    autoplayLoop: true,
  };
}

// Adopts the server-evaluated widget config (context mode) wholesale, then
// keeps any value the embed set explicitly on the script tag. Precedence:
// explicit data-* attributes > dashboard settings > defaults. (Previously
// dashboard settings silently overrode explicit attributes, which kept
// test-store/simulator overrides from sticking.)
export function applyContextConfig(config: ContextConfig | undefined): void {
  const script = ctx.script;
  const launcher: LauncherServerConfig = (config && config.launcher) || {};
  const display: DisplayServerConfig = (config && config.display) || {};
  const carousel: CarouselServerConfig = (config && config.carousel) || {};

  if (launcher.position && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.position)) {
    ctx.launcherConfig.position = launcher.position;
  }
  if (launcher.accent_color && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.accentColor)) {
    ctx.launcherConfig.accentColor = launcher.accent_color;
  }
  if (launcher.background_color && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.backgroundColor)) {
    ctx.launcherConfig.backgroundColor = launcher.background_color;
  }
  if (launcher.text_color && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.textColor)) {
    ctx.launcherConfig.textColor = launcher.text_color;
  }
  if (typeof launcher.label === "string" && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.label)) {
    ctx.launcherConfig.label = launcher.label;
  }
  if (launcher.font_family && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.fontFamily)) {
    ctx.launcherConfig.fontFamily = launcher.font_family;
  }
  if (launcher.bubble_size && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.bubbleSize)) {
    ctx.launcherConfig.bubbleSize = Number(launcher.bubble_size) || ctx.launcherConfig.bubbleSize;
  }
  if (launcher.model && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.model)) {
    ctx.launcherConfig.model = launcher.model;
  }
  if (launcher.offset_x && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.offsetX)) {
    ctx.launcherConfig.offsetX = Number(launcher.offset_x) || ctx.launcherConfig.offsetX;
  }
  if (launcher.offset_y && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.offsetY)) {
    ctx.launcherConfig.offsetY = Number(launcher.offset_y) || ctx.launcherConfig.offsetY;
  }
  if (Number.isFinite(Number(launcher.border_radius))) {
    ctx.launcherConfig.borderRadius = Number(launcher.border_radius);
  }
  if ("shadow_enabled" in launcher) {
    ctx.launcherConfig.shadowEnabled = launcher.shadow_enabled !== false;
  }
  if (launcher.shadow_color) {
    ctx.launcherConfig.shadowColor = launcher.shadow_color;
  }
  if (Number.isFinite(Number(launcher.shadow_opacity))) {
    ctx.launcherConfig.shadowOpacity = Number(launcher.shadow_opacity);
  }
  if (Number.isFinite(Number(launcher.shadow_blur))) {
    ctx.launcherConfig.shadowBlur = Number(launcher.shadow_blur);
  }

  if ("hide_without_videos" in display && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.hideWithoutVideos)) {
    ctx.displayConfig.hideWithoutVideos = display.hide_without_videos === true;
  }
  if (
    "home_experience_enabled" in display &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.homeExperienceEnabled)
  ) {
    ctx.displayConfig.homeExperienceEnabled = display.home_experience_enabled !== false;
  }

  if ("enabled" in carousel && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.homeCarouselEnabled)) {
    ctx.carouselConfig.enabled = carousel.enabled !== false;
  }
  if (typeof carousel.title === "string" && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselTitle)) {
    ctx.carouselConfig.title = carousel.title || ctx.carouselConfig.title;
  }
  if (
    typeof carousel.description === "string" &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselDescription)
  ) {
    ctx.carouselConfig.description = carousel.description;
  }
  if (
    typeof carousel.before_heading === "string" &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselBeforeHeading)
  ) {
    ctx.carouselConfig.beforeHeading = carousel.before_heading || ctx.carouselConfig.beforeHeading;
  }
  if (
    carousel.anchor_selector &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselAnchorSelector)
  ) {
    ctx.carouselConfig.anchorSelector = carousel.anchor_selector;
  }
  if (
    carousel.anchor_placement &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselAnchorPlacement)
  ) {
    ctx.carouselConfig.anchorPlacement = carousel.anchor_placement;
  }
  if (
    carousel.anchor_fallback &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselAnchorFallback)
  ) {
    ctx.carouselConfig.anchorFallback = carousel.anchor_fallback;
  }
  if ("max_items" in carousel && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselMaxItems)) {
    ctx.carouselConfig.maxItems = Number(carousel.max_items) || ctx.carouselConfig.maxItems;
  }
  if (
    "mobile_max_items" in carousel &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselMobileMaxItems)
  ) {
    ctx.carouselConfig.mobileMaxItems = Number(carousel.mobile_max_items) || ctx.carouselConfig.mobileMaxItems;
  }
  if ("show_price" in carousel && !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselShowPrice)) {
    ctx.carouselConfig.showPrice = carousel.show_price !== false;
  }
  if (
    "show_cart_actions" in carousel &&
    !hasExplicitScriptValue(script, SCRIPT_VALUE_SPECS.carouselShowCartActions)
  ) {
    ctx.carouselConfig.showCartActions = carousel.show_cart_actions !== false;
  }

  // Layout/appearance/card/autoplay: dashboard-only, no explicit-embed-value
  // check needed (see buildCarouselConfig's comment).
  if (Number.isFinite(Number(carousel.section_padding_x))) {
    ctx.carouselConfig.sectionPaddingX = Number(carousel.section_padding_x);
  }
  if (Number.isFinite(Number(carousel.section_padding_y))) {
    ctx.carouselConfig.sectionPaddingY = Number(carousel.section_padding_y);
  }
  if (typeof carousel.section_margin_x === "number") {
    ctx.carouselConfig.sectionMarginX = carousel.section_margin_x;
  }
  if (typeof carousel.section_margin_y === "number") {
    ctx.carouselConfig.sectionMarginY = carousel.section_margin_y;
  }
  if (typeof carousel.card_gap === "number") {
    ctx.carouselConfig.cardGap = carousel.card_gap;
  }
  if ("show_scroll_hint" in carousel) {
    ctx.carouselConfig.showScrollHint = carousel.show_scroll_hint !== false;
  }
  if (carousel.background_color) {
    ctx.carouselConfig.backgroundColor = carousel.background_color;
  }
  if (carousel.title_color) {
    ctx.carouselConfig.titleColor = carousel.title_color;
  }
  if (carousel.description_color) {
    ctx.carouselConfig.descriptionColor = carousel.description_color;
  }
  if (typeof carousel.accent_color === "string") {
    ctx.carouselConfig.accentColor = carousel.accent_color;
  }
  if (carousel.font_source) {
    ctx.carouselConfig.fontSource = carousel.font_source;
  }
  if (typeof carousel.font_family === "string") {
    ctx.carouselConfig.fontFamily = carousel.font_family;
  }
  if ("show_title" in carousel) {
    ctx.carouselConfig.showTitle = carousel.show_title !== false;
  }
  if ("show_description" in carousel) {
    ctx.carouselConfig.showDescription = carousel.show_description !== false;
  }
  if (Number.isFinite(Number(carousel.card_border_radius))) {
    ctx.carouselConfig.cardBorderRadius = Number(carousel.card_border_radius);
  }
  if (carousel.card_min_width) {
    ctx.carouselConfig.cardMinWidth = Number(carousel.card_min_width) || ctx.carouselConfig.cardMinWidth;
  }
  if (carousel.card_max_width) {
    ctx.carouselConfig.cardMaxWidth = Number(carousel.card_max_width) || ctx.carouselConfig.cardMaxWidth;
  }
  if (carousel.card_aspect_ratio) {
    ctx.carouselConfig.cardAspectRatio = carousel.card_aspect_ratio;
  }
  if (carousel.card_background_color) {
    ctx.carouselConfig.cardBackgroundColor = carousel.card_background_color;
  }
  if ("card_shadow_enabled" in carousel) {
    ctx.carouselConfig.cardShadowEnabled = carousel.card_shadow_enabled === true;
  }
  if (carousel.card_shadow_color) {
    ctx.carouselConfig.cardShadowColor = carousel.card_shadow_color;
  }
  if (Number.isFinite(Number(carousel.card_shadow_opacity))) {
    ctx.carouselConfig.cardShadowOpacity = Number(carousel.card_shadow_opacity);
  }
  if (Number.isFinite(Number(carousel.card_shadow_blur))) {
    ctx.carouselConfig.cardShadowBlur = Number(carousel.card_shadow_blur);
  }
  if (Number.isFinite(Number(carousel.card_shadow_offset_x))) {
    ctx.carouselConfig.cardShadowOffsetX = Number(carousel.card_shadow_offset_x);
  }
  if (Number.isFinite(Number(carousel.card_shadow_offset_y))) {
    ctx.carouselConfig.cardShadowOffsetY = Number(carousel.card_shadow_offset_y);
  }
  if (carousel.pill_background_color) {
    ctx.carouselConfig.pillBackgroundColor = carousel.pill_background_color;
  }
  if (carousel.pill_text_color) {
    ctx.carouselConfig.pillTextColor = carousel.pill_text_color;
  }
  if (carousel.nav_arrow_background_color) {
    ctx.carouselConfig.navArrowBackgroundColor = carousel.nav_arrow_background_color;
  }
  if (carousel.nav_arrow_icon_color) {
    ctx.carouselConfig.navArrowIconColor = carousel.nav_arrow_icon_color;
  }
  if ("autoplay_enabled" in carousel) {
    ctx.carouselConfig.autoplayEnabled = carousel.autoplay_enabled === true;
  }
  if (carousel.autoplay_interval_ms) {
    ctx.carouselConfig.autoplayIntervalMs =
      Number(carousel.autoplay_interval_ms) || ctx.carouselConfig.autoplayIntervalMs;
  }
  if (carousel.autoplay_direction) {
    ctx.carouselConfig.autoplayDirection = carousel.autoplay_direction;
  }
  if ("autoplay_pause_on_hover" in carousel) {
    ctx.carouselConfig.autoplayPauseOnHover = carousel.autoplay_pause_on_hover !== false;
  }
  if ("autoplay_loop" in carousel) {
    ctx.carouselConfig.autoplayLoop = carousel.autoplay_loop !== false;
  }
}
