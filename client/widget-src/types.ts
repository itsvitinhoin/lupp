// Lupp widget – shared TypeScript contracts.
//
// Mirrors the server's context-mode bootstrap response
// (GET /api/widget/bootstrap?url=...) and the window bridge through which the
// core bundle and the lazily loaded platform adapters share config, mutable
// state and helpers.

// ---------------------------------------------------------------------------
// Context bootstrap payload (server response)
// ---------------------------------------------------------------------------

export type SlimProduct = {
  id: string;
  external_id: string;
  name: string;
  image_url: string | null;
  price_label: string;
  product_url: string;
}

export type SlimVideo = {
  id: string;
  title: string;
  media_url: string;
  thumbnail_url: string;
  product: SlimProduct | null;
}

export type ContextDisplay = {
  show: boolean;
  reason: string;
  show_home_carousel?: boolean;
}

export type LauncherServerConfig = {
  position?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  label?: string;
  font_family?: string;
  bubble_size?: number;
  model?: string;
  offset_x?: number;
  offset_y?: number;
}

export type DisplayServerConfig = {
  mode?: string;
  product_mode?: string;
  include_paths?: string[];
  exclude_paths?: string[];
  hide_without_videos?: boolean;
  home_experience_enabled?: boolean;
}

export type CarouselServerConfig = {
  enabled?: boolean;
  title?: string;
  description?: string;
  before_heading?: string;
  anchor_selector?: string;
  anchor_placement?: string;
  anchor_fallback?: string;
  max_items?: number;
  mobile_max_items?: number;
  show_price?: boolean;
  show_cart_actions?: boolean;
  section_padding_x?: number;
  section_padding_y?: number;
  section_margin_x?: number;
  section_margin_y?: number;
  card_gap?: number;
  show_scroll_hint?: boolean;
  show_navigation_arrows?: boolean;
  background_color?: string;
  title_color?: string;
  description_color?: string;
  accent_color?: string;
  font_source?: string;
  font_family?: string;
  show_title?: boolean;
  show_description?: boolean;
  card_border_radius?: number;
  card_min_width?: number;
  card_max_width?: number;
  card_aspect_ratio?: string;
  card_background_color?: string;
  card_shadow_enabled?: boolean;
  card_shadow_color?: string;
  card_shadow_opacity?: number;
  card_shadow_blur?: number;
  card_shadow_offset_x?: number;
  card_shadow_offset_y?: number;
  autoplay_enabled?: boolean;
  autoplay_interval_ms?: number;
  autoplay_direction?: string;
  autoplay_pause_on_hover?: boolean;
  autoplay_loop?: boolean;
  disabled_reason?: string;
}

export type ContextConfig = {
  launcher?: LauncherServerConfig;
  display?: DisplayServerConfig;
  carousel?: CarouselServerConfig;
}

export type UpzeroConfig = {
  storefront_url?: string;
  storefront_store_id?: number | string;
  store_id?: number | string;
  upzero_store_id?: number | string;
  cart_action_ids?: string[];
  [key: string]: unknown;
}

export type StorePayload = {
  id: string | null;
  slug?: string;
  button_color?: string;
  status?: string;
  platform?: string;
  url?: string;
  plan_id?: string;
  upzero_config?: UpzeroConfig | null;
  [key: string]: unknown;
}

export type BootstrapPayload = {
  active?: boolean;
  mode?: string;
  error?: string | null;
  resolved_by?: string | null;
  store?: StorePayload | null;
  upzero_config?: UpzeroConfig | null;
  display?: ContextDisplay;
  config?: ContextConfig;
  videos?: SlimVideo[];
  widget?: unknown;
}

// ---------------------------------------------------------------------------
// Resolved (client-side) config shapes
// ---------------------------------------------------------------------------

export type LauncherConfig = {
  position: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  label: string;
  fontFamily: string;
  bubbleSize: number;
  model: string;
  offsetX: number;
  offsetY: number;
}

export type DisplayConfig = {
  hideWithoutVideos: boolean;
  homeExperienceEnabled: boolean;
}

export type CarouselConfig = {
  title: string;
  description: string;
  enabled: boolean;
  beforeHeading: string;
  anchorSelector: string;
  anchorPlacement: string;
  anchorFallback: string;
  maxItems: number;
  mobileMaxItems: number;
  showPrice: boolean;
  showCartActions: boolean;
  sectionPaddingX: number;
  sectionPaddingY: number;
  sectionMarginX: number;
  sectionMarginY: number;
  cardGap: number;
  showScrollHint: boolean;
  showNavigationArrows: boolean;
  backgroundColor: string;
  titleColor: string;
  descriptionColor: string;
  /** "" means inherit the launcher's accentColor. */
  accentColor: string;
  /** "store" | "launcher" | "custom" — see fontFamily. */
  fontSource: string;
  /** Only read when fontSource === "custom". */
  fontFamily: string;
  showTitle: boolean;
  showDescription: boolean;
  cardBorderRadius: number;
  cardMinWidth: number;
  cardMaxWidth: number;
  cardAspectRatio: string;
  cardBackgroundColor: string;
  cardShadowEnabled: boolean;
  cardShadowColor: string;
  cardShadowOpacity: number;
  cardShadowBlur: number;
  cardShadowOffsetX: number;
  cardShadowOffsetY: number;
  autoplayEnabled: boolean;
  autoplayIntervalMs: number;
  autoplayDirection: string;
  autoplayPauseOnHover: boolean;
  autoplayLoop: boolean;
}

// ---------------------------------------------------------------------------
// Cross-module runtime shapes
// ---------------------------------------------------------------------------

export type CustomerStatus = {
  approved: boolean;
  loggedIn: boolean;
  source?: string;
  status: string;
}

/** Detail payload carried by the pending storefront cart refresh. */
export type CartUpdateDetail = {
  cart?: unknown;
  items: unknown[];
  quantity: number;
  provider?: string;
  source?: string;
  storeId?: number | string | null;
}

export type UpzeroCartItem = {
  assetId: number | null;
  productVariantId: number;
  quantity: number;
}

export type NuvemshopCartItem = {
  product_id: number;
  quantity: number;
  variant_id: number;
}

export type ShopifyCartItem = {
  id: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// window.__LUPP_WIDGET_BRIDGE__
// ---------------------------------------------------------------------------

export type BridgeConfig = {
  apiUrl: string;
  configuredProductId: string;
  configuredProductUrl: string;
  externalStoreId: string;
  luppBaseUrl: string;
  nubesdkFrameMode: string;
  storeDomain: string;
  storeId: string;
  storeSlug: string;
  upzeroProxyBase: string;
  widgetType: string;
}

export type BridgeState = {
  activeStore: StorePayload | null;
  upzeroConfig: UpzeroConfig;
  pendingStorefrontCartRefresh: boolean;
  pendingStorefrontCartDetail: CartUpdateDetail | null;
  upzeroCustomerStatusCache: CustomerStatus | null;
  upzeroCustomerStatusLastRefreshAt: number;
}

export interface BridgeUtils {
  asRecord(value: unknown): Record<string, unknown>;
  createAnchor(url?: string): HTMLAnchorElement;
  debugLog(...args: unknown[]): void;
  emitCartEvent(eventName: string, detail: unknown): void;
  escapeHtml(value: unknown): string;
  getUrlHostname(value: string): string;
  getUrlOrigin(value: string): string;
  getUrlPathname(value: string, base?: string): string;
  normalizedHostname(value: unknown): string;
  readQueryValue(url: string, name: string): string | null;
  resolveUrl(value: string, base?: string): string;
  sameStorefrontHostname(left: unknown, right: unknown): boolean;
}

export interface UpzeroAdapter {
  addItemsToCart(
    items: unknown,
    options?: { productUrl?: string },
  ): Promise<unknown>;
  detectUpzeroCustomerStatus(
    store: StorePayload | null,
    options?: { forceRefresh?: boolean },
  ): Promise<CustomerStatus>;
}

export interface NuvemshopAdapter {
  addItemsToCart(items: unknown): Promise<unknown>;
}

export interface ShopifyAdapter {
  addItemsToCart(
    items: unknown,
    options?: { productUrl?: string },
  ): Promise<unknown>;
  fetchProductJson(productUrl?: string): Promise<unknown>;
  normalizeProductForLupp(product: unknown): unknown;
}

export interface AdapterRegistry {
  upzero?: UpzeroAdapter;
  nuvemshop?: NuvemshopAdapter;
  shopify?: ShopifyAdapter;
}

export type AdapterPlatform = keyof AdapterRegistry;

export interface WidgetBridge {
  adapters: AdapterRegistry;
  config: BridgeConfig;
  state: BridgeState;
  utils: BridgeUtils;
  isUpzeroStore(store: StorePayload | null): boolean;
  isNuvemshopStore(store: StorePayload | null): boolean;
  isShopifyStore(store: StorePayload | null): boolean;
  isTrustedLuppFrameOrigin(origin: string): boolean;
  postFrameResponse(
    target: MessageEventSource | Window | null,
    origin: string,
    type: string,
    requestId: unknown,
    payload: { ok?: boolean; error?: unknown; product?: unknown },
  ): void;
  updateUpzeroCartCounters(quantity: number): void;
  updateNuvemshopCartCounters(quantity: number): void;
  updateShopifyCartCounters(quantity: number): void;
  track(
    storeId: string | null | undefined,
    eventType: string,
    videoId?: string | null,
    productId?: string | null,
    metadata?: Record<string, unknown>,
  ): void;
}

// ---------------------------------------------------------------------------
// Storefront window globals the widget inspects
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __LUPP_WIDGET_BRIDGE__?: WidgetBridge;
    __LUUP_DEBUG__?: boolean;
    LUPP_API_URL?: string;
    Hls?: HlsStatic;
    // Nuvemshop storefront globals
    LS?: {
      store?: { id?: number | string };
      store_id?: number | string;
      product?: { id?: number | string };
    };
    Tiendanube?: { storeId?: number | string };
    __LUUP_NUVEMSHOP_ADD_TO_CART__?: (items: unknown[]) => unknown;
    LuupNuvemshopCart?: { addItems?: (items: unknown[]) => unknown };
    // Shopify storefront globals
    Shopify?: { shop?: string; routes?: { root?: string } };
    ShopifyAnalytics?: { meta?: { shop?: string } };
    // Upzero storefront globals
    UPZERO_CLIENT?: unknown;
    UPZERO_CUSTOMER?: unknown;
    upzeroClient?: unknown;
    upzeroCustomer?: unknown;
    UPZERO_PRODUCT_ID?: number | string;
    UPZero?: { product?: { id?: number | string } };
    UPZERO_STORE_ID?: number | string;
    __UPZERO_STORE_ID__?: number | string;
    storeId?: number | string;
    __NEXT_DATA__?: unknown;
    __UPZERO_DATA__?: unknown;
    __STORE__?: unknown;
    __STORE_DATA__?: unknown;
    next?: { router?: { reload?: () => void } };
  }
}

/** Minimal surface of the CDN-loaded hls.js the widget touches. */
export interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, handler: () => void): void;
  currentLevel: number;
  nextLevel: number;
}

export interface HlsStatic {
  new (config: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events?: { MANIFEST_PARSED?: string };
}
