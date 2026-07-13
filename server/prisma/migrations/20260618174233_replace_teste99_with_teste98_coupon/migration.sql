-- Ported from supabase/migrations/20260618174233_replace_teste99_with_teste98_coupon.sql.
-- id and updated_at are set explicitly because the ported table has no DB
-- defaults for them (ids are app-generated, updated_at is Prisma @updatedAt).

INSERT INTO "discount_coupons" (
  "id",
  "code",
  "name",
  "description",
  "percent_off",
  "amount_off",
  "duration",
  "is_active",
  "metadata",
  "updated_at"
)
VALUES (
  gen_random_uuid()::text,
  'TESTE98',
  'Teste 98',
  'Cupom interno para testes de checkout com 98% de desconto.',
  98,
  NULL,
  'once',
  true,
  '{"created_for": "checkout_testing"}'::jsonb,
  now()
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "percent_off" = EXCLUDED."percent_off",
  "amount_off" = EXCLUDED."amount_off",
  "duration" = EXCLUDED."duration",
  "is_active" = EXCLUDED."is_active",
  "metadata" = EXCLUDED."metadata",
  "updated_at" = now();

UPDATE "discount_coupons"
SET
  "is_active" = false,
  "updated_at" = now()
WHERE upper("code") = 'TESTE99';
