-- Ported from supabase/migrations/20260623004058_monthly_usage_rpc.sql.
-- The get_store_monthly_usage() RPC and its grant are dropped — monthly usage
-- is computed with Prisma queries app-side. Only the supporting index remains,
-- renamed to Prisma conventions.

-- CreateIndex
CREATE INDEX "analytics_events_store_id_event_type_created_at_idx" ON "analytics_events"("store_id", "event_type", "created_at" DESC);
