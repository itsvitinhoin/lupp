-- Console access moves from the MASTER_ADMIN_EMAILS allowlist to role-based
-- verification (users.role = 'admin'; base roles: admin | manager | agent),
-- and the "master" labeling becomes "admin". Renames preserve the audit data.
ALTER TABLE "master_console_audit_logs" RENAME TO "admin_console_audit_logs";
ALTER INDEX "master_console_audit_logs_pkey" RENAME TO "admin_console_audit_logs_pkey";
ALTER INDEX "master_console_audit_logs_created_at_idx" RENAME TO "admin_console_audit_logs_created_at_idx";
ALTER INDEX "master_console_audit_logs_target_store_id_idx" RENAME TO "admin_console_audit_logs_target_store_id_idx";
ALTER TABLE "admin_console_audit_logs" RENAME CONSTRAINT "master_console_audit_logs_admin_user_id_fkey" TO "admin_console_audit_logs_admin_user_id_fkey";
ALTER TABLE "admin_console_audit_logs" RENAME CONSTRAINT "master_console_audit_logs_target_store_id_fkey" TO "admin_console_audit_logs_target_store_id_fkey";

-- Promote the account from the retired MASTER_ADMIN_EMAILS default allowlist
-- so console access survives the switchover.
UPDATE users SET role = 'admin' WHERE lower(email) = 'playluup@gmail.com';
