export interface MasterConsoleMetrics {
  activeStores: number;
  activeVideos: number;
  arr: number;
  expiredTrials: number;
  monthAddToCart: number;
  monthViews: number;
  mrr: number;
  paidStores: number;
  pausedStores: number;
  processingVideos: number;
  trialStores: number;
  trialsEndingSoon: number;
}

export interface MasterConsoleIntegrationSummary {
  external_store_id: string | null;
  last_sync_at: string | null;
  provider: string;
  status: string;
}

export interface MasterConsoleStoreRow {
  active_integrations: MasterConsoleIntegrationSummary[];
  active_videos: number;
  active_widgets: number;
  add_to_cart_month: number;
  created_at: string;
  feed_opens_month: number;
  id: string;
  logo_url: string | null;
  mrr: number;
  name: string;
  owner_email: string | null;
  owner_name: string | null;
  plan_id: string;
  plan_name: string;
  platform: string | null;
  processing_videos: number;
  product_clicks_month: number;
  products: number;
  shares_month: number;
  slug: string;
  status: string;
  subscription_id: string | null;
  subscription_status: string | null;
  trial_days_left: number | null;
  trial_ends_at: string | null;
  updated_at: string;
  url: string | null;
  video_views_month: number;
  widget_views_month: number;
}

export interface MasterConsoleAuditLog {
  action: string;
  admin_email: string | null;
  created_at: string;
  id: string;
  target_store_id: string | null;
}

export interface MasterConsoleSnapshot {
  audit_logs: MasterConsoleAuditLog[];
  generated_at: string;
  metrics: MasterConsoleMetrics;
  stores: MasterConsoleStoreRow[];
}

export type MasterConsoleAction =
  | "activate_store"
  | "extend_trial"
  | "pause_store"
  | "set_plan";
