// Lupp widget – shared runtime state for the core bundle.
//
// main.ts and the core/* modules it orchestrates own configuration parsing,
// bootstrap fetching and navigation watching; the render/carousel/launcher
// modules and feed.ts read everything they need from this mutable context
// object, populated by main.ts during startup (always before any render code
// can run — function declarations are hoisted). This mirrors the
// window-bridge pattern used by the platform adapters: the module that
// assigns a value owns it, everyone else reads it through the shared object.
//
// Boundary: everything under core/, render/ and feed.ts is bundled into the
// same widget.js entry point as main.ts, so importing `ctx` there is safe —
// they share one module instance. platforms/*.ts are separate esbuild entry
// points (built to their own widget-{platform}.js) and must NEVER import
// `ctx` directly; they only ever reach shared state through
// window.__LUPP_WIDGET_BRIDGE__ (see types.ts's WidgetBridge).
import type {
  BridgeState,
  CarouselConfig,
  ContextDisplay,
  CustomerStatus,
  DisplayConfig,
  LauncherConfig,
  SlimProduct,
  SlimVideo,
  StorePayload,
} from "./types";

export interface WidgetRuntimeContext {
  script: HTMLScriptElement;
  widgetType: string;
  nubesdkFrameMode: string;
  previewMode: string;
  storeId: string;
  storeSlug: string;
  externalStoreId: string;
  storeDomain: string;
  apiUrl: string;
  luppBaseUrl: string;
  bootstrapBase: string;
  eventsBase: string;
  upzeroProxyBase: string;
  requireActiveWidget: boolean;
  configuredProductId: string;
  configuredProductUrl: string;
  loadStrategy: string;
  launcherConfig: LauncherConfig;
  displayConfig: DisplayConfig;
  carouselConfig: CarouselConfig;
  sharedState: BridgeState;
  contextDisplay: Partial<ContextDisplay>;
  activeVideos: SlimVideo[];
  /** Whether at least one bootstrap/context response has been applied yet. */
  hasLoadedVideoList: boolean;
  /** The URL renderForCurrentUrl last rendered for (SPA out-of-order guard). */
  lastRenderedUrl: string;
  /** The URL the most recent context fetch was requested for (stale-response guard). */
  lastRequestedContextUrl: string;
  track(
    storeId: string | null | undefined,
    eventType: string,
    videoId?: string | null,
    productId?: string | null,
    metadata?: Record<string, unknown>,
  ): void;
  currentProductUrl(): string;
  detectCustomerStatus(
    store: StorePayload | null,
    options?: { forceRefresh?: boolean },
  ): Promise<CustomerStatus>;
  repairUpzeroProductUrl(
    productInput: SlimProduct | Record<string, unknown> | null,
    fallbackUrl: string | undefined,
    store: StorePayload | null,
  ): string;
  flushPendingStorefrontCartRefresh(): void;
  renderForCurrentUrl(root: HTMLElement): void;
}

// Populated by main.ts before the first render; the cast is the same escape
// hatch the adapter bridge uses (every field exists by the time it is read).
export const ctx = {
  contextDisplay: {},
  activeVideos: [],
  hasLoadedVideoList: false,
  lastRenderedUrl: "",
  lastRequestedContextUrl: "",
} as unknown as WidgetRuntimeContext;

export function isUpzeroStore(store: StorePayload | null | undefined): boolean {
  return String((store && store.platform) || "").toLowerCase() === "upzero";
}

export function videoMediaUrl(video: Partial<SlimVideo> | null | undefined): string {
  if (!video) return "";
  return video.media_url || "";
}
