// Lupp widget – shared runtime context for the core render modules.
//
// main.ts owns configuration parsing and orchestration; the render/overlay
// modules read everything they need from this mutable context object, which
// main.ts populates during startup (always before any render code can run).
// This mirrors the window-bridge pattern used by the platform adapters: the
// module that assigns a value owns it, everyone else reads it through the
// shared object.
import type {
  BridgeState,
  CarouselConfig,
  ContextDisplay,
  CustomerStatus,
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
  luppBaseUrl: string;
  launcherConfig: LauncherConfig;
  carouselConfig: CarouselConfig;
  sharedState: BridgeState;
  contextDisplay: Partial<ContextDisplay>;
  activeVideos: SlimVideo[];
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
} as unknown as WidgetRuntimeContext;

export function isUpzeroStore(store: StorePayload | null | undefined): boolean {
  return String((store && store.platform) || "").toLowerCase() === "upzero";
}

export function videoMediaUrl(video: Partial<SlimVideo> | null | undefined): string {
  if (!video) return "";
  return video.media_url || "";
}
