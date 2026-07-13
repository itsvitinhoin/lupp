-- Ported from supabase/migrations/20260618133430_add_asaas_billing_fields.sql.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "provider_checkout_id" TEXT,
ADD COLUMN "provider_checkout_url" TEXT,
ADD COLUMN "provider_payment_id" TEXT,
ADD COLUMN "provider_status" TEXT,
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "subscriptions_provider_checkout_id_idx" ON "subscriptions"("provider_checkout_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_payment_id_idx" ON "subscriptions"("provider_payment_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_subscription_id_idx" ON "subscriptions"("provider_subscription_id");
