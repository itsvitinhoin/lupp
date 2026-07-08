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
  'TESTE98',
  'Teste 98',
  'Cupom interno para testes de checkout com 98% de desconto.',
  98,
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

update public.discount_coupons
set
  is_active = false,
  updated_at = now()
where upper(code) = 'TESTE99';
