-- Ported from supabase/migrations/20260618171408_add_trial_and_discount_coupons.sql.
-- Dropped relative to Supabase: the store_has_billing_access() security-definer
-- function, all RLS/policies/grants, the updated_at trigger, the discount XOR
-- CHECK (enforced app-side per schema.prisma) and the upper(code) expression
-- indexes (Prisma cannot model them; codes are normalized app-side). The
-- duration CHECK becomes the "CouponDuration" enum.

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "trial_started_at" TIMESTAMPTZ(6),
ADD COLUMN "trial_ends_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "discount_coupon_id" TEXT,
ADD COLUMN "discount_code" TEXT,
ADD COLUMN "discount_percent" DECIMAL(65,30),
ADD COLUMN "discount_amount" DECIMAL(65,30);

-- CreateEnum
CREATE TYPE "CouponDuration" AS ENUM ('once', 'forever');

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

-- CreateIndex
CREATE UNIQUE INDEX "discount_coupons_code_key" ON "discount_coupons"("code");

-- CreateIndex
CREATE INDEX "subscriptions_discount_coupon_id_idx" ON "subscriptions"("discount_coupon_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_coupon_id_fkey" FOREIGN KEY ("discount_coupon_id") REFERENCES "discount_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill trial windows for existing stores
UPDATE "stores"
SET
  "trial_started_at" = COALESCE("trial_started_at", "created_at"),
  "trial_ends_at" = COALESCE(
    "trial_ends_at",
    (
      SELECT MIN(s."current_period_end")
      FROM "subscriptions" s
      WHERE s."store_id" = "stores"."id"
        AND s."status" = 'trialing'
    ),
    "created_at" + INTERVAL '7 days'
  )
WHERE "trial_started_at" IS NULL
   OR "trial_ends_at" IS NULL;

-- Clamp trialing periods to the 7-day trial window
UPDATE "subscriptions"
SET "current_period_end" = LEAST("current_period_end", "current_period_start" + INTERVAL '7 days')
WHERE "status" = 'trialing'
  AND "current_period_start" IS NOT NULL
  AND "current_period_end" IS NOT NULL
  AND "current_period_end" > "current_period_start" + INTERVAL '7 days';
