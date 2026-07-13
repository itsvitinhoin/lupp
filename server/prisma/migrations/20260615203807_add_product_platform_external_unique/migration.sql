-- Ported from supabase/migrations/20260615203807_add_product_platform_external_unique.sql.
-- Prisma cannot model partial indexes; this one is superseded by the full unique
-- index in 20260623000123_add_products_full_unique_for_sync, which drops it.

-- CreateIndex
CREATE UNIQUE INDEX "products_store_platform_external_unique" ON "products"("store_id", "platform", "external_id") WHERE "external_id" IS NOT NULL AND "platform" IS NOT NULL;
