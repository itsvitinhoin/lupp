-- Ported from supabase/migrations/20260623000123_add_products_full_unique_for_sync.sql.
-- Supabase kept the partial index from 20260615203807 alongside the new full
-- one; the full index dominates it (unique NULLs are distinct), and Prisma
-- models only the full index, so the partial one is retired here.

-- DropIndex
DROP INDEX "products_store_platform_external_unique";

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_platform_external_id_key" ON "products"("store_id", "platform", "external_id");
