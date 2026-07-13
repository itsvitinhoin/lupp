-- Ported from supabase/migrations/20260615131513_init_lupp_mvp_schema.sql for
-- plain Postgres. auth.users + profiles are merged into a single "users" table
-- (this server owns auth), text + CHECK pseudo-enums become real enums, ids are
-- app-generated TEXT (uuid(7)) instead of uuid DEFAULT gen_random_uuid(), and
-- updated_at triggers are replaced by Prisma @updatedAt. RLS, policies, grants
-- and the pgcrypto extension are dropped (no Supabase roles here).

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('active', 'paused', 'disabled');

-- CreateEnum
CREATE TYPE "StoreMemberRole" AS ENUM ('owner', 'admin', 'marketing', 'editor', 'analyst');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

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
CREATE TYPE "AnalyticsEventType" AS ENUM ('video_view', 'video_progress', 'video_complete', 'product_click', 'add_to_cart_click', 'share_click', 'like_click', 'comment_create', 'widget_view', 'feed_open');

-- CreateTable (merged auth.users + public.profiles)
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "store_members_store_id_user_id_key" ON "store_members"("store_id", "user_id");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE INDEX "videos_store_id_status_idx" ON "videos"("store_id", "status");

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
CREATE UNIQUE INDEX "integrations_store_id_provider_key" ON "integrations"("store_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "feed_settings_store_id_key" ON "feed_settings"("store_id");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_settings" ADD CONSTRAINT "feed_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default plans (idempotent; prisma/seed.ts upserts the same rows)
INSERT INTO "plans" ("id", "name", "price_monthly", "video_limit", "view_limit", "widget_limit", "features")
VALUES
  ('start', 'Start', 149, 30, 5000, 1, '["30 vídeos", "5k views/mês", "1 widget ativo"]'::jsonb),
  ('growth', 'Growth', 199, 80, 20000, 5, '["80 vídeos", "20k views/mês", "5 widgets ativos"]'::jsonb),
  ('pro', 'Pro', 299, 200, 60000, 999, '["200 vídeos", "60k views/mês", "comentários moderados", "analytics avançado"]'::jsonb),
  ('scale', 'Scale', 499, 500, 150000, 999, '["500 vídeos", "150k views/mês", "multiusuário", "suporte prioritário"]'::jsonb)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price_monthly" = EXCLUDED."price_monthly",
  "video_limit" = EXCLUDED."video_limit",
  "view_limit" = EXCLUDED."view_limit",
  "widget_limit" = EXCLUDED."widget_limit",
  "features" = EXCLUDED."features";
