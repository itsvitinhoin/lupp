-- Ported from supabase/migrations/20260618173346_seed_teste99_coupon.sql.
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
  'TESTE99',
  'Teste 99',
  'Cupom interno para testes de checkout com 99% de desconto.',
  99,
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
