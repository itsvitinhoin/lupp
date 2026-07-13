-- Ported from supabase/migrations/20260710172527_normalize_carousel_defaults_and_upzero_platform.sql.
-- Dropped relative to Supabase: the private.normalize_floating_widget_settings()
-- trigger (floating-widget defaults are applied app-side in the widgets
-- use-case) and the self-assignment UPDATE on widgets whose only purpose was
-- firing that trigger. The two data repairs below are kept verbatim.

-- A store with one active commerce provider should reflect that provider in
-- stores.platform. This repairs old onboarding records without guessing when
-- multiple commerce integrations are active.
WITH single_active_provider AS (
  SELECT "store_id", MIN("provider") AS "provider"
  FROM "integrations"
  WHERE "status" = 'active'
    AND "provider" IN ('upzero', 'nuvemshop', 'shopify')
  GROUP BY "store_id"
  HAVING COUNT(DISTINCT "provider") = 1
)
UPDATE "stores" AS stores
SET "platform" = providers."provider"
FROM single_active_provider AS providers
WHERE stores."id" = providers."store_id"
  AND stores."platform" IS DISTINCT FROM providers."provider";

-- Lipcem is an UP Zero storefront and had been overwritten as Nuvemshop by
-- an older connection flow. Only repair it when its UP Zero integration is
-- still active, so this migration never manufactures credentials.
UPDATE "stores" AS stores
SET "platform" = 'upzero'
WHERE stores."slug" = 'lipcem'
  AND EXISTS (
    SELECT 1
    FROM "integrations" AS integrations
    WHERE integrations."store_id" = stores."id"
      AND integrations."provider" = 'upzero'
      AND integrations."status" = 'active'
  )
  AND stores."platform" IS DISTINCT FROM 'upzero';
