insert into public.discount_coupons (
  code,
  name,
  description,
  percent_off,
  amount_off,
  duration,
  is_active,
  metadata
)
values (
  'TESTE99',
  'Teste 99',
  'Cupom interno para testes de checkout com 99% de desconto.',
  99,
  null,
  'once',
  true,
  '{"created_for": "checkout_testing"}'::jsonb
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  percent_off = excluded.percent_off,
  amount_off = excluded.amount_off,
  duration = excluded.duration,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();
