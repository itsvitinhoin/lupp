-- Ported from supabase/migrations/20260617194505_add_product_variants.sql.
-- The updated_at trigger, RLS, policies and grants are dropped; the status
-- CHECK reuses the "ProductStatus" enum; the unique constraint becomes a
-- unique index and index names follow Prisma conventions.

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

-- CreateIndex
CREATE INDEX "product_variants_store_id_idx" ON "product_variants"("store_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_platform_external_id_idx" ON "product_variants"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_platform_external_id_key" ON "product_variants"("store_id", "platform", "external_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
