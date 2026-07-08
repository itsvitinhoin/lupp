alter table public.subscriptions
  add column if not exists provider_checkout_id text,
  add column if not exists provider_checkout_url text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists subscriptions_provider_checkout_id_idx
  on public.subscriptions(provider_checkout_id);

create index if not exists subscriptions_provider_payment_id_idx
  on public.subscriptions(provider_payment_id);

create index if not exists subscriptions_provider_subscription_id_idx
  on public.subscriptions(provider_subscription_id);
