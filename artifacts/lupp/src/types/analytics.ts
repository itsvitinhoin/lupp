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
}
