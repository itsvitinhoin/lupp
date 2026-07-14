-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('email_confirmation', 'password_reset');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_confirmed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every pre-existing user (Supabase-era or OAuth-provisioned) is
-- grandfathered as confirmed; only accounts created via the new password
-- sign-up flow start unconfirmed.
UPDATE "users" SET "email_confirmed_at" = now() WHERE "email_confirmed_at" IS NULL;
