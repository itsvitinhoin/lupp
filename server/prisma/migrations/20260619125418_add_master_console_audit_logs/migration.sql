-- Ported from supabase/migrations/20260619125418_add_master_console_audit_logs.sql.
-- admin_user_id references public "users" instead of auth.users; RLS and role
-- revokes are dropped.

-- CreateTable
CREATE TABLE "master_console_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "admin_email" TEXT,
    "action" TEXT NOT NULL,
    "target_store_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_console_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_console_audit_logs_created_at_idx" ON "master_console_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "master_console_audit_logs_target_store_id_idx" ON "master_console_audit_logs"("target_store_id");

-- AddForeignKey
ALTER TABLE "master_console_audit_logs" ADD CONSTRAINT "master_console_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_console_audit_logs" ADD CONSTRAINT "master_console_audit_logs_target_store_id_fkey" FOREIGN KEY ("target_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
