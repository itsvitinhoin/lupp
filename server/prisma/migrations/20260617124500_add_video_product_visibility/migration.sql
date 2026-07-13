-- Ported from supabase/migrations/20260617124500_add_video_product_visibility.sql.
-- The text + CHECK column becomes a real enum.

-- CreateEnum
CREATE TYPE "ProductVisibilityScope" AS ENUM ('product', 'variant');

-- AlterTable
ALTER TABLE "videos" ADD COLUMN "product_visibility_scope" "ProductVisibilityScope" NOT NULL DEFAULT 'product',
ADD COLUMN "product_visibility_url" TEXT;
