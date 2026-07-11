-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('active', 'paused', 'disabled');

-- CreateEnum
CREATE TYPE "StoreMemberRole" AS ENUM ('owner', 'admin', 'marketing', 'editor', 'analyst');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('draft', 'active', 'paused', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "ProductVisibilityScope" AS ENUM ('product', 'variant');

-- CreateEnum
CREATE TYPE "VideoProcessingStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "WidgetType" AS ENUM ('product_video', 'home_showcase', 'floating_video', 'collection_feed', 'stories_bar');

-- CreateEnum
CREATE TYPE "WidgetStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "CustomPageLayout" AS ENUM ('vertical_feed', 'grid', 'carousel');

-- CreateEnum
CREATE TYPE "CustomPageStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('pending', 'approved', 'hidden', 'reported', 'deleted');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('video_view', 'video_progress', 'video_complete', 'product_click', 'add_to_cart_click', 'share_click', 'like_click', 'comment_create', 'widget_view', 'feed_open', 'launcher_impression', 'feed_close');

-- CreateEnum
CREATE TYPE "CouponDuration" AS ENUM ('once', 'forever');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "price_monthly" DECIMAL(65,30),
    "video_limit" INTEGER,
    "view_limit" INTEGER,
    "widget_limit" INTEGER,
    "features" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "percent_off" DECIMAL(65,30),
    "amount_off" DECIMAL(65,30),
    "duration" "CouponDuration" NOT NULL DEFAULT 'once',
    "max_redemptions" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "discount_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT,
    "platform" TEXT,
    "segment" TEXT,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#006BFF',
    "secondary_color" TEXT NOT NULL DEFAULT '#00D4FF',
    "button_color" TEXT NOT NULL DEFAULT '#006BFF',
    "status" "StoreStatus" NOT NULL DEFAULT 'active',
    "plan_id" TEXT NOT NULL DEFAULT 'start',
    "trial_started_at" TIMESTAMPTZ(6),
    "trial_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_members" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "StoreMemberRole" NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(65,30),
    "compare_at_price" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "image_url" TEXT,
    "product_url" TEXT,
    "platform" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'upzero',
    "external_id" TEXT NOT NULL,
    "sku" TEXT,
    "color_name" TEXT,
    "color_code" TEXT,
    "color_hex" TEXT,
    "size_name" TEXT,
    "size_code" TEXT,
    "price" DECIMAL(65,30),
    "compare_at_price" DECIMAL(65,30),
    "stock_qty" INTEGER,
    "image_url" TEXT,
    "asset_id" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_url" TEXT,
    "thumbnail_url" TEXT,
    "storage_path" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'supabase',
    "duration_seconds" INTEGER,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "status" "VideoStatus" NOT NULL DEFAULT 'draft',
    "cta_label" TEXT NOT NULL DEFAULT 'Ver produto',
    "is_feed_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_product_page_enabled" BOOLEAN NOT NULL DEFAULT true,
    "allow_likes" BOOLEAN NOT NULL DEFAULT true,
    "allow_comments" BOOLEAN NOT NULL DEFAULT false,
    "allow_sharing" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "product_visibility_scope" "ProductVisibilityScope" NOT NULL DEFAULT 'product',
    "product_visibility_url" TEXT,
    "provider_video_id" TEXT,
    "playback_url" TEXT,
    "processing_status" "VideoProcessingStatus" NOT NULL DEFAULT 'ready',
    "file_size" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_products" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widgets" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WidgetType" NOT NULL,
    "status" "WidgetStatus" NOT NULL DEFAULT 'inactive',
    "target" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_pages" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "layout" "CustomPageLayout" NOT NULL DEFAULT 'vertical_feed',
    "status" "CustomPageStatus" NOT NULL DEFAULT 'draft',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_page_videos" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_page_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "author_name" TEXT,
    "author_email" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_likes" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "visitor_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "video_id" TEXT,
    "product_id" TEXT,
    "event_type" "AnalyticsEventType" NOT NULL,
    "visitor_id" TEXT,
    "session_id" TEXT,
    "url" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "external_store_id" TEXT,
    "connected_at" TIMESTAMPTZ(6),
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_secrets" (
    "integration_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_store_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "token_type" TEXT,
    "scope" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_secrets_pkey" PRIMARY KEY ("integration_id")
);

-- CreateTable
CREATE TABLE "integration_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_store_id" TEXT,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "provider" TEXT,
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "provider_checkout_id" TEXT,
    "provider_checkout_url" TEXT,
    "provider_payment_id" TEXT,
    "provider_status" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "discount_coupon_id" TEXT,
    "discount_code" TEXT,
    "discount_percent" DECIMAL(65,30),
    "discount_amount" DECIMAL(65,30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL DEFAULT 'videos',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feed_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_console_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "admin_email" TEXT,
    "action" TEXT NOT NULL,
    "target_store_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_console_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "discount_coupons_code_key" ON "discount_coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "store_members_store_id_user_id_key" ON "store_members"("store_id", "user_id");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_platform_external_id_key" ON "products"("store_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "product_variants_store_id_idx" ON "product_variants"("store_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_platform_external_id_idx" ON "product_variants"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_platform_external_id_key" ON "product_variants"("store_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "videos_store_id_status_idx" ON "videos"("store_id", "status");

-- CreateIndex
CREATE INDEX "videos_provider_provider_video_id_idx" ON "videos"("provider", "provider_video_id");

-- CreateIndex
CREATE INDEX "video_products_video_id_idx" ON "video_products"("video_id");

-- CreateIndex
CREATE INDEX "video_products_product_id_idx" ON "video_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_products_video_id_product_id_key" ON "video_products"("video_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_pages_store_id_slug_key" ON "custom_pages"("store_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "custom_page_videos_page_id_video_id_key" ON "custom_page_videos"("page_id", "video_id");

-- CreateIndex
CREATE INDEX "comments_store_id_status_idx" ON "comments"("store_id", "status");

-- CreateIndex
CREATE INDEX "video_likes_video_id_idx" ON "video_likes"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_likes_video_id_visitor_id_key" ON "video_likes"("video_id", "visitor_id");

-- CreateIndex
CREATE INDEX "analytics_events_store_id_created_at_idx" ON "analytics_events"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_events_video_id_idx" ON "analytics_events"("video_id");

-- CreateIndex
CREATE INDEX "analytics_events_store_id_event_type_created_at_idx" ON "analytics_events"("store_id", "event_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_store_id_provider_key" ON "integrations"("store_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_provider_external_store_id_key" ON "integrations"("provider", "external_store_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_secrets_provider_external_store_id_key" ON "integration_secrets"("provider", "external_store_id");

-- CreateIndex
CREATE INDEX "integration_webhook_events_provider_external_store_id_creat_idx" ON "integration_webhook_events"("provider", "external_store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "integration_webhook_events_event_created_at_idx" ON "integration_webhook_events"("event", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscriptions_provider_checkout_id_idx" ON "subscriptions"("provider_checkout_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_payment_id_idx" ON "subscriptions"("provider_payment_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_subscription_id_idx" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_discount_coupon_id_idx" ON "subscriptions"("discount_coupon_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_settings_store_id_key" ON "feed_settings"("store_id");

-- CreateIndex
CREATE INDEX "master_console_audit_logs_created_at_idx" ON "master_console_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "master_console_audit_logs_target_store_id_idx" ON "master_console_audit_logs"("target_store_id");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_products" ADD CONSTRAINT "video_products_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_products" ADD CONSTRAINT "video_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_pages" ADD CONSTRAINT "custom_pages_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_page_videos" ADD CONSTRAINT "custom_page_videos_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "custom_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_page_videos" ADD CONSTRAINT "custom_page_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_likes" ADD CONSTRAINT "video_likes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_coupon_id_fkey" FOREIGN KEY ("discount_coupon_id") REFERENCES "discount_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_settings" ADD CONSTRAINT "feed_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_console_audit_logs" ADD CONSTRAINT "master_console_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_console_audit_logs" ADD CONSTRAINT "master_console_audit_logs_target_store_id_fkey" FOREIGN KEY ("target_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
