import type { AnalyticsEventType, Json, TableInsert } from "./database";

export interface TrackingContext {
  visitorId?: string;
  sessionId?: string;
  url?: string;
  referrer?: string;
  userAgent?: string;
}

export type TrackEventPayload = Omit<TableInsert<"analytics_events">, "event_type"> & {
  event_type: AnalyticsEventType;
  metadata?: Json;
};

export interface DashboardMetrics {
  views: number;
  productClicks: number;
  ctr: number;
  addToCart: number;
  attributedRevenue: number;
  activeVideos: number;
  totalLikes: number;
  pendingComments: number;
  attributedPurchases?: number;
  averageFeedbackRating?: number;
  cartRate?: number;
  checkoutStarted?: number;
  checkoutRate?: number;
  engagementRate?: number;
  feedOpenRate?: number;
  feedOpens?: number;
  averageFeedSessionSeconds?: number;
  productClickRate?: number;
  revenueMode?: "estimated" | "attributed" | "unavailable";
  sessions?: number;
  uniqueVisitors?: number;
  widgetImpressions?: number;
  chartData?: DashboardChartPoint[];
  capabilities?: DashboardCapabilities;
  funnel?: DashboardFunnelStep[];
  topProducts?: DashboardRankingItem[];
  topVideos?: DashboardRankingItem[];
}

export interface DashboardCapabilities {
  attributionLabel: string;
  checkoutLabel: string;
  integrationName: string;
  provider: string;
  supportsAttributedOrders: boolean;
  supportsAttributedRevenue: boolean;
  supportsCartEvents: boolean;
  supportsInlineCheckout: boolean;
  supportsVariantGrid: boolean;
}

export interface DashboardChartPoint {
  addToCart: number;
  date: string;
  feedOpens: number;
  impressions: number;
  productClicks: number;
  revenue: number;
  views: number;
}

export interface DashboardFunnelStep {
  description: string;
  enabled: boolean;
  key: string;
  rateFromPrevious: number | null;
  title: string;
  value: number;
}

export interface DashboardRankingItem {
  addToCart: number;
  clicks: number;
  id: string;
  imageUrl?: string | null;
  label: string;
  rate: number;
  revenue: number;
  subtitle?: string | null;
  views: number;
}
