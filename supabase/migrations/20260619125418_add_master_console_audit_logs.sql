create table if not exists public.master_console_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_store_id uuid references public.stores(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists master_console_audit_logs_created_at_idx
  on public.master_console_audit_logs(created_at desc);

create index if not exists master_console_audit_logs_target_store_id_idx
  on public.master_console_audit_logs(target_store_id);

alter table public.master_console_audit_logs enable row level security;

revoke all on public.master_console_audit_logs from anon, authenticated;
