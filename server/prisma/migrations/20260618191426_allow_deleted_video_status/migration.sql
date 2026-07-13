-- Ported from supabase/migrations/20260618191426_allow_deleted_video_status.sql.
-- The videos.status CHECK relaxation becomes an enum value addition.

-- AlterEnum
ALTER TYPE "VideoStatus" ADD VALUE 'deleted';
