-- Ported from supabase/migrations/20260615202216_add_nuvemshop_lgpd_webhook_events.sql.
-- RLS and role revokes are dropped; id is app-generated TEXT.

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

-- CreateIndex
CREATE INDEX "integration_webhook_events_provider_external_store_id_creat_idx" ON "integration_webhook_events"("provider", "external_store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "integration_webhook_events_event_created_at_idx" ON "integration_webhook_events"("event", "created_at" DESC);
