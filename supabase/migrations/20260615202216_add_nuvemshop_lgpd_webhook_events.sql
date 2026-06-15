create table if not exists public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_store_id text,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists integration_webhook_events_provider_store_idx
  on public.integration_webhook_events(provider, external_store_id, created_at desc);

create index if not exists integration_webhook_events_event_idx
  on public.integration_webhook_events(event, created_at desc);

alter table public.integration_webhook_events enable row level security;

revoke all on table public.integration_webhook_events from public, anon, authenticated;
