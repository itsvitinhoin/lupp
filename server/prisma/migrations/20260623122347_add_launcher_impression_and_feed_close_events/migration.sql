-- Ported from supabase/migrations/20260623122347_add_launcher_impression_and_feed_close_events.sql.
-- The analytics_events.event_type CHECK relaxation becomes enum value
-- additions, in this order to match schema.prisma.

-- AlterEnum
ALTER TYPE "AnalyticsEventType" ADD VALUE 'launcher_impression';

-- AlterEnum
ALTER TYPE "AnalyticsEventType" ADD VALUE 'feed_close';
