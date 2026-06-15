alter table public.integrations
  add column if not exists external_store_id text,
  add column if not exists connected_at timestamptz,
  add column if not exists last_sync_at timestamptz;

create unique index if not exists integrations_provider_external_store_unique
  on public.integrations(provider, external_store_id)
  where external_store_id is not null;

create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  provider text not null,
  external_store_id text not null,
  access_token text not null,
  token_type text,
  scope text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_secrets_provider_external_store_unique
  on public.integration_secrets(provider, external_store_id);

drop trigger if exists integration_secrets_set_updated_at on public.integration_secrets;
create trigger integration_secrets_set_updated_at before update on public.integration_secrets
  for each row execute function public.set_updated_at();

alter table public.integration_secrets enable row level security;
revoke all on table public.integration_secrets from public, anon, authenticated;
