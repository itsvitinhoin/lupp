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

export const VIDEO_STATUS = ["draft", "active", "paused", "archived"] as const;
export const COMMENT_STATUS = ["pending", "approved", "hidden", "reported", "deleted"] as const;
export const STORE_MEMBER_ROLES = ["owner", "admin", "marketing", "editor", "analyst"] as const;

export const PLAN_LIMITS = {
  start: { name: "Start", priceMonthly: 149, videoLimit: 30, viewLimit: 5000, widgetLimit: 1 },
  growth: { name: "Growth", priceMonthly: 199, videoLimit: 80, viewLimit: 20000, widgetLimit: 5 },
  pro: { name: "Pro", priceMonthly: 299, videoLimit: 200, viewLimit: 60000, widgetLimit: 999 },
  scale: { name: "Scale", priceMonthly: 499, videoLimit: 500, viewLimit: 150000, widgetLimit: 999 },
} as const;

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
] as const;

export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
