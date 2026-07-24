export interface AdminConsoleMetrics {
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

export interface AdminConsoleIntegrationSummary {
  external_store_id: string | null;
  last_sync_at: string | null;
  provider: string;
  status: string;
}

export interface AdminConsoleStoreRow {
  active_integrations: AdminConsoleIntegrationSummary[];
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

export interface AdminConsoleAuditLog {
  action: string;
  admin_email: string | null;
  created_at: string;
  id: string;
  target_store_id: string | null;
}

export interface AdminConsoleSnapshot {
  audit_logs: AdminConsoleAuditLog[];
  generated_at: string;
  metrics: AdminConsoleMetrics;
  stores: AdminConsoleStoreRow[];
}

export type AdminConsoleAction =
  | "activate_store"
  | "add_member"
  | "add_user_to_store"
  | "confirm_user_email"
  | "extend_trial"
  | "pause_store"
  | "remove_member"
  | "remove_user_from_store"
  | "reset_user_password"
  | "send_password_reset"
  | "set_member_role"
  | "set_plan"
  | "set_user_email_confirmed"
  | "set_user_role"
  | "update_feed"
  | "update_store"
  | "update_widget";

export interface AdminStorePatch {
  button_color?: string;
  logo_url?: string | null;
  name?: string;
  platform?: string | null;
  primary_color?: string;
  secondary_color?: string;
  segment?: string | null;
  status?: string;
  url?: string | null;
}

export interface AdminStoreRecord {
  button_color: string;
  created_at: string;
  id: string;
  logo_url: string | null;
  name: string;
  owner_id: string;
  plan_id: string;
  platform: string | null;
  primary_color: string;
  secondary_color: string;
  segment: string | null;
  slug: string;
  status: string;
  trial_ends_at: string | null;
  trial_started_at: string | null;
  updated_at: string;
  url: string | null;
}

export interface AdminStoreUser {
  created_at: string;
  email: string;
  email_confirmed_at: string | null;
  id: string;
  name: string;
}

export interface AdminStoreMember {
  created_at: string;
  id: string;
  role: string;
  user: AdminStoreUser;
}

export interface AdminSubscription {
  created_at: string;
  current_period_end: string | null;
  current_period_start: string | null;
  discount_amount: string | number | null;
  discount_code: string | null;
  discount_percent: string | number | null;
  id: string;
  plan: { id: string; name: string | null; price_monthly: string | number | null } | null;
  plan_id: string | null;
  provider: string | null;
  provider_status: string | null;
  provider_subscription_id: string | null;
  status: string;
}

export interface AdminIntegrationSecret {
  access_token: string;
  external_store_id: string;
  metadata: Record<string, unknown>;
  provider: string;
  scope: string | null;
  token_type: string | null;
  updated_at: string;
}

export interface AdminIntegration {
  connected_at: string | null;
  created_at: string;
  credentials: Record<string, unknown>;
  external_store_id: string | null;
  id: string;
  last_sync_at: string | null;
  provider: string;
  secret: AdminIntegrationSecret | null;
  settings: Record<string, unknown>;
  status: string;
}

export interface AdminWidget {
  created_at: string;
  id: string;
  name: string;
  settings: Record<string, unknown>;
  status: string;
  target: string | null;
  type: string;
}

export interface AdminStoreEvent {
  created_at: string;
  event_type: string;
  id: string;
  product: { id: string; name: string } | null;
  url: string | null;
  video: { id: string; title: string } | null;
}

export interface AdminStoreEventsPage {
  events: AdminStoreEvent[];
  next_cursor: string | null;
  window_days: number;
}

export interface AdminCursorPage<TItem> {
  items: TItem[];
  next_cursor: string | null;
}

export interface AdminPlatformUserStoreRef {
  id: string;
  name: string;
  slug: string;
}

export interface AdminPlatformUserMembership {
  id: string;
  role: string;
  store: AdminPlatformUserStoreRef;
}

export interface AdminPlatformUser {
  avatar_url: string | null;
  created_at: string;
  email: string;
  email_confirmed_at: string | null;
  id: string;
  memberships: AdminPlatformUserMembership[];
  name: string;
  role: string;
  stores: (AdminPlatformUserStoreRef & { status: string })[];
  updated_at: string;
}

export interface AdminStoreProduct {
  _count: { variants: number; video_products: number };
  compare_at_price: string | number | null;
  created_at: string;
  currency: string;
  description: string | null;
  external_id: string | null;
  id: string;
  image_url: string | null;
  name: string;
  platform: string | null;
  price: string | number | null;
  product_url: string | null;
  status: string;
  updated_at: string;
}

export interface AdminBunnyVideo {
  guid: string;
  title: string | null;
  dateUploaded: string | null;
  length: number | null;
  status: number | null;
  storageSize: number | null;
  views: number | null;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  db: {
    id: string;
    title: string;
    status: string;
    processing_status: string;
    store: { id: string; name: string; slug: string } | null;
    products: { id: string; name: string }[];
  } | null;
}

export interface AdminBunnyVideosPage {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  items: AdminBunnyVideo[];
}

export interface AdminBunnySummary {
  library_id: string;
  cdn_hostname: string;
  bunny_video_count: number | null;
  local_video_count: number;
  local_storage_bytes: string;
}

export interface AdminStoreVideo {
  _count: { comments: number; likes: number; video_products: number };
  allow_comments: boolean;
  allow_likes: boolean;
  allow_sharing: boolean;
  aspect_ratio: string;
  created_at: string;
  cta_label: string;
  description: string | null;
  duration_seconds: number | null;
  id: string;
  is_featured: boolean;
  is_feed_enabled: boolean;
  is_product_page_enabled: boolean;
  playback_url: string | null;
  processing_status: string;
  provider: string;
  provider_video_id: string | null;
  status: string;
  thumbnail_url: string | null;
  title: string;
  updated_at: string;
  video_url: string | null;
}

export interface AdminStoreComment {
  author_email: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  id: string;
  status: string;
  updated_at: string;
  video: { id: string; title: string } | null;
}

export interface AdminWebhookEvent {
  created_at: string;
  error: string | null;
  event: string;
  external_store_id: string | null;
  id: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  provider: string;
  status: string;
}

export interface AdminStoreDetail {
  analytics_30d: { count: number; event_type: string }[];
  audit_logs: AdminConsoleAuditLog[];
  counts: {
    comments_pending: number;
    comments_total: number;
    custom_pages: number;
    events_30d_total: number;
    likes_total: number;
    products_active: number;
    products_total: number;
    videos_active: number;
    videos_processing: number;
    videos_total: number;
    widgets_active: number;
    widgets_total: number;
  };
  custom_pages: {
    created_at: string;
    id: string;
    layout: string;
    name: string;
    slug: string;
    status: string;
  }[];
  feed_settings: {
    id: string;
    is_active: boolean;
    settings: Record<string, unknown>;
    slug: string;
  } | null;
  generated_at: string;
  integrations: AdminIntegration[];
  members: AdminStoreMember[];
  mrr: number;
  owner: AdminStoreUser;
  plan: { id: string; name: string | null; price_monthly: string | number | null } | null;
  store: AdminStoreRecord;
  store_domains: { created_at: string; domain: string; id: string; source: string }[];
  subscriptions: AdminSubscription[];
  trial_days_left: number | null;
  webhook_events: AdminWebhookEvent[];
  widgets: AdminWidget[];
}

// ---------------------------------------------------------------------------
// Live Asaas account reads (admin console, /api/billing/asaas/*)
// ---------------------------------------------------------------------------

export interface AsaasListPage<TItem> {
  data: TItem[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  totalCount?: number;
}

export interface AsaasPayment {
  billingType?: string;
  customer?: string;
  dateCreated?: string;
  description?: string | null;
  dueDate?: string;
  id: string;
  invoiceUrl?: string | null;
  netValue?: number;
  paymentDate?: string | null;
  status?: string;
  subscription?: string | null;
  value?: number;
}

export interface AsaasCustomer {
  cpfCnpj?: string | null;
  dateCreated?: string;
  email?: string | null;
  externalReference?: string | null;
  id: string;
  mobilePhone?: string | null;
  name?: string;
}

export interface AsaasAccountSubscription {
  billingType?: string;
  customer?: string;
  cycle?: string;
  dateCreated?: string;
  description?: string | null;
  externalReference?: string | null;
  id: string;
  nextDueDate?: string;
  status?: string;
  value?: number;
}

export interface AsaasWebhookConfig {
  enabled?: boolean;
  events?: string[];
  id?: string;
  name?: string;
  sendType?: string;
  url?: string;
}

export interface AsaasAccountOverview {
  balance: number | null;
  environment: string;
  webhooks: AsaasWebhookConfig[] | null;
}

export interface AsaasInvoice {
  customer?: string | null;
  effectiveDate?: string | null;
  externalReference?: string | null;
  id: string;
  municipalServiceName?: string | null;
  number?: string | null;
  payment?: string | null;
  pdfUrl?: string | null;
  rpsNumber?: string | null;
  serviceDescription?: string | null;
  status?: string;
  value?: number;
  xmlUrl?: string | null;
}

export interface AsaasStatistic {
  netValue: number | null;
  quantity: number | null;
  value: number | null;
}

export interface AsaasSummary {
  days: number;
  overdue: AsaasStatistic | null;
  pending: AsaasStatistic | null;
  received: AsaasStatistic | null;
}

export interface AsaasDailyPoint {
  count: number;
  date: string;
  paid_value: number;
  value: number;
}

export interface AsaasDailySeries {
  days: number;
  series: AsaasDailyPoint[];
}

export interface AsaasPaymentFilters {
  billingType?: string;
  dateCreatedGe?: string;
  dueDateGe?: string;
  dueDateLe?: string;
  offset?: number;
  status?: string;
}

export interface AsaasInvoiceFilters {
  effectiveDateGe?: string;
  offset?: number;
  status?: string;
}
