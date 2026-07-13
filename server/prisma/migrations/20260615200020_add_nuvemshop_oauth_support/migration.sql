-- Ported from supabase/migrations/20260615200020_add_nuvemshop_oauth_support.sql.
-- The updated_at trigger, RLS and role revokes are dropped (Prisma @updatedAt,
-- no Supabase roles). Supabase's unique index was partial
-- (WHERE external_store_id IS NOT NULL); a full unique index is equivalent here
-- because Postgres treats NULLs as distinct, and it is what schema.prisma models.

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN "external_store_id" TEXT,
ADD COLUMN "connected_at" TIMESTAMPTZ(6),
ADD COLUMN "last_sync_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_provider_external_store_id_key" ON "integrations"("provider", "external_store_id");

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

-- CreateIndex
CREATE UNIQUE INDEX "integration_secrets_provider_external_store_id_key" ON "integration_secrets"("provider", "external_store_id");

-- AddForeignKey
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
