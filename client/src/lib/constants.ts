import { asRecord } from "@/lib/utils";
export const LUPP_BRAND = {
  name: "Lupp",
  slogan: "O feed que vende dentro da sua loja.",
  colors: {
    background: "#050A18",
    card: "#121B33",
    primary: "#006BFF",
    cyan: "#00D4FF",
    conversion: "#47FF9C",
    text: "#F7FAFF",
    muted: "#A6B0C3",
  },
} as const;

export const VIDEO_STATUS = ["draft", "active", "paused", "archived", "deleted"] as const;
export const COMMENT_STATUS = ["pending", "approved", "hidden", "reported", "deleted"] as const;
export const STORE_MEMBER_ROLES = ["owner", "admin", "marketing", "editor", "analyst"] as const;

export const PLAN_LIMITS = {
  start: { name: "Start", priceMonthly: 149, videoLimit: 100, viewLimit: 5000, widgetLimit: 1 },
  growth: { name: "Growth", priceMonthly: 199, videoLimit: 300, viewLimit: 20000, widgetLimit: 5 },
  pro: { name: "Pro", priceMonthly: 299, videoLimit: 1000, viewLimit: 60000, widgetLimit: 999 },
  scale: { name: "Scale", priceMonthly: 499, videoLimit: 5000, viewLimit: 150000, widgetLimit: 999 },
} as const;

export type LuupPlanId = keyof typeof PLAN_LIMITS;

type WidgetLike = {
  settings?: unknown;
  status?: string | null;
  type?: string | null;
};

export function isLuupPlanId(value: unknown): value is LuupPlanId {
  return typeof value === "string" && value in PLAN_LIMITS;
}

export function normalizeLuupPlanId(value: unknown): LuupPlanId {
  return isLuupPlanId(value) ? value : "start";
}

export function planAllowsHorizontalFeed(value: unknown) {
  const planId = normalizeLuupPlanId(value);
  return PLAN_LIMITS[planId].widgetLimit >= 2;
}

export function isHorizontalFeedEnabledInSettings(settingsValue: unknown) {
  const settings = asRecord(settingsValue);
  const carousel = asRecord(settings.carousel);
  return carousel.enabled === true;
}

export function countBillableWidgets(widgets: WidgetLike[]) {
  const activeWidgets = widgets.filter((widget) => widget.status === "active");
  const hasFloatingWidget = activeWidgets.some((widget) =>
    ["floating_video", "floating_launcher"].includes(String(widget.type || "")),
  );
  const standaloneWidgets = activeWidgets.filter(
    (widget) =>
      !["floating_video", "floating_launcher"].includes(
        String(widget.type || ""),
      ) && String(widget.type || "") !== "home_carousel",
  ).length;
  const hasHomeCarousel =
    activeWidgets.some((widget) => String(widget.type || "") === "home_carousel") ||
    activeWidgets.some((widget) =>
      isHorizontalFeedEnabledInSettings(widget.settings),
    );

  return (hasFloatingWidget ? 1 : 0) + (hasHomeCarousel ? 1 : 0) + standaloneWidgets;
}

export function withDefaultFloatingWidgetSettings(settingsValue?: unknown) {
  const settings = asRecord(settingsValue);
  const display = asRecord(settings.display);
  const carousel = asRecord(settings.carousel);

  return {
    ...settings,
    display: {
      mode: "all",
      include_paths: [],
      exclude_paths: ["/checkout", "/carrinho", "/cart"],
      product_mode: "linked_or_all",
      hide_without_videos: false,
      home_experience_enabled: true,
      home_ordering: "manual",
      ...display,
    },
    carousel: {
      enabled: true,
      title: "Descubra cada detalhe e Compre",
      description: "",
      before_heading: "Com Capa",
      max_items: 12,
      mobile_max_items: 6,
      ...carousel,
    },
  };
}

export const DEFAULT_WIDGETS = [
  { name: "Product Video", type: "product_video", target: "product" },
  { name: "Home Showcase", type: "home_showcase", target: "home" },
  { name: "Floating Video", type: "floating_video", target: "site" },
  { name: "Stories Bar", type: "stories_bar", target: "site" },
] as const;

export const ECOMMERCE_PROVIDERS = [
  "nuvemshop",
  "shopify",
  "woocommerce",
  "tray",
  "yampi",
  "loja_integrada",
  "vtex",
] as const;

export const TRACKING_PROVIDERS = ["ga4", "meta_pixel", "tiktok_pixel", "webhook"] as const;

export const ANALYTICS_EVENT_TYPES = [
  "video_view",
  "video_progress",
  "video_complete",
  "product_click",
  "add_to_cart_click",
  "share_click",
  "like_click",
  "comment_create",
  "widget_view",
  "feed_open",
  "launcher_impression",
  "feed_close",
] as const;

const configuredVideoUploadMb = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_MB || 200);
export const MAX_VIDEO_UPLOAD_MB = Number.isFinite(configuredVideoUploadMb) && configuredVideoUploadMb > 0 ? configuredVideoUploadMb : 200;
export const MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_MB * 1024 * 1024;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const ACCEPTED_VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"];
export const ACCEPTED_VIDEO_INPUT_TYPES = [
  ...ACCEPTED_VIDEO_TYPES,
  ...ACCEPTED_VIDEO_EXTENSIONS.map((extension) => `.${extension}`),
];

const VIDEO_TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function extensionFromName(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function getVideoContentType(file: Pick<File, "name" | "type">) {
  return file.type || VIDEO_TYPE_BY_EXTENSION[extensionFromName(file.name)] || "";
}

export function isAcceptedVideoFile(file: Pick<File, "name" | "type">) {
  const contentType = getVideoContentType(file);
  return ACCEPTED_VIDEO_TYPES.includes(contentType) || ACCEPTED_VIDEO_EXTENSIONS.includes(extensionFromName(file.name));
}
