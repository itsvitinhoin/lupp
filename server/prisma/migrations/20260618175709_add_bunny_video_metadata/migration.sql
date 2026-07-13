-- Ported from supabase/migrations/20260618175709_add_bunny_video_metadata.sql.
-- The processing_status CHECK becomes the "VideoProcessingStatus" enum and the
-- index name follows Prisma conventions.

-- CreateEnum
CREATE TYPE "VideoProcessingStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed', 'archived');

-- AlterTable
ALTER TABLE "videos" ADD COLUMN "provider_video_id" TEXT,
ADD COLUMN "playback_url" TEXT,
ADD COLUMN "processing_status" "VideoProcessingStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN "file_size" BIGINT;

-- CreateIndex
CREATE INDEX "videos_provider_provider_video_id_idx" ON "videos"("provider", "provider_video_id");

-- Backfill playback/processing metadata for existing videos
UPDATE "videos"
SET
  "playback_url" = COALESCE("playback_url", "video_url"),
  "processing_status" = (CASE
    WHEN "status" = 'archived' THEN 'archived'
    WHEN "video_url" IS NULL THEN 'failed'
    ELSE 'ready'
  END)::"VideoProcessingStatus"
WHERE "playback_url" IS NULL;
