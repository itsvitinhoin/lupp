create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  url text,
  platform text,
  segment text,
  logo_url text,
  primary_color text not null default '#006BFF',
  secondary_color text not null default '#00D4FF',
  button_color text not null default '#006BFF',
  status text not null default 'active',
  plan_id text not null default 'start',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_status_check check (status in ('active', 'paused', 'disabled'))
);

create table public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint store_members_role_check check (role in ('owner', 'admin', 'marketing', 'editor', 'analyst')),
  constraint store_members_unique unique (store_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null,
  description text,
  price numeric,
  compare_at_price numeric,
  currency text not null default 'BRL',
  image_url text,
  product_url text,
  platform text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status_check check (status in ('active', 'draft', 'archived'))
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  description text,
  video_url text,
  thumbnail_url text,
  storage_path text,
  provider text not null default 'supabase',
  duration_seconds int,
  aspect_ratio text not null default '9:16',
  status text not null default 'draft',
  cta_label text not null default 'Ver produto',
  is_feed_enabled boolean not null default true,
  is_product_page_enabled boolean not null default true,
  allow_likes boolean not null default true,
  allow_comments boolean not null default false,
  allow_sharing boolean not null default true,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create table public.video_products (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint video_products_unique unique (video_id, product_id)
);

create table public.widgets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  type text not null,
  status text not null default 'inactive',
  target text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint widgets_type_check check (type in ('product_video', 'home_showcase', 'floating_video', 'collection_feed', 'stories_bar')),
  constraint widgets_status_check check (status in ('active', 'inactive'))
);

create table public.custom_pages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  layout text not null default 'vertical_feed',
  status text not null default 'draft',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_pages_layout_check check (layout in ('vertical_feed', 'grid', 'carousel')),
  constraint custom_pages_status_check check (status in ('draft', 'active', 'inactive')),
  constraint custom_pages_store_slug_unique unique (store_id, slug)
);

create table public.custom_page_videos (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.custom_pages(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint custom_page_videos_unique unique (page_id, video_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  author_name text,
  author_email text,
  body text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_status_check check (status in ('pending', 'approved', 'hidden', 'reported', 'deleted'))
);

create table public.video_likes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  visitor_id text,
  created_at timestamptz not null default now(),
  constraint video_likes_unique unique (video_id, visitor_id)
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  event_type text not null,
  visitor_id text,
  session_id text,
  url text,
  referrer text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_events_type_check check (
    event_type in (
      'video_view',
      'video_progress',
      'video_complete',
      'product_click',
      'add_to_cart_click',
      'share_click',
      'like_click',
      'comment_create',
      'widget_view',
      'feed_open'
    )
  )
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  status text not null default 'available',
  credentials jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_provider_unique unique (store_id, provider)
);

create table public.plans (
  id text primary key,
  name text,
  price_monthly numeric,
  video_limit int,
  view_limit int,
  widget_limit int,
  features jsonb not null default '[]'::jsonb
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plan_id text references public.plans(id),
  status text not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feed_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade unique,
  is_active boolean not null default true,
  slug text not null default 'videos',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_store_id_idx on public.products(store_id);
create index videos_store_status_idx on public.videos(store_id, status);
create index video_products_video_id_idx on public.video_products(video_id);
create index video_products_product_id_idx on public.video_products(product_id);
create index comments_store_status_idx on public.comments(store_id, status);
create index video_likes_video_id_idx on public.video_likes(video_id);
create index analytics_events_store_created_idx on public.analytics_events(store_id, created_at desc);
create index analytics_events_video_id_idx on public.analytics_events(video_id);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger videos_set_updated_at before update on public.videos for each row execute function public.set_updated_at();
create trigger widgets_set_updated_at before update on public.widgets for each row execute function public.set_updated_at();
create trigger custom_pages_set_updated_at before update on public.custom_pages for each row execute function public.set_updated_at();
create trigger comments_set_updated_at before update on public.comments for each row execute function public.set_updated_at();
create trigger integrations_set_updated_at before update on public.integrations for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger feed_settings_set_updated_at before update on public.feed_settings for each row execute function public.set_updated_at();

insert into public.plans (id, name, price_monthly, video_limit, view_limit, widget_limit, features)
values
  ('start', 'Start', 149, 30, 5000, 1, '["30 vídeos", "5k views/mês", "1 widget ativo"]'::jsonb),
  ('growth', 'Growth', 199, 80, 20000, 5, '["80 vídeos", "20k views/mês", "5 widgets ativos"]'::jsonb),
  ('pro', 'Pro', 299, 200, 60000, 999, '["200 vídeos", "60k views/mês", "comentários moderados", "analytics avançado"]'::jsonb),
  ('scale', 'Scale', 499, 500, 150000, 999, '["500 vídeos", "150k views/mês", "multiusuário", "suporte prioritário"]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  video_limit = excluded.video_limit,
  view_limit = excluded.view_limit,
  widget_limit = excluded.widget_limit,
  features = excluded.features;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.products enable row level security;
alter table public.videos enable row level security;
alter table public.video_products enable row level security;
alter table public.widgets enable row level security;
alter table public.custom_pages enable row level security;
alter table public.custom_page_videos enable row level security;
alter table public.comments enable row level security;
alter table public.video_likes enable row level security;
alter table public.analytics_events enable row level security;
alter table public.integrations enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.feed_settings enable row level security;

create schema if not exists private;

create or replace function private.is_store_member(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = check_store_id
      and sm.user_id = auth.uid()
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_store_member(uuid) from public;
grant execute on function private.is_store_member(uuid) to authenticated;

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, public.profiles.name),
    email = coalesce(excluded.email, public.profiles.email),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_user_profile();

create policy "profiles are visible to owner" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles are insertable by owner" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles are editable by owner" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "stores visible to members" on public.stores for select to authenticated using (private.is_store_member(id) or owner_id = auth.uid());
create policy "active stores are public" on public.stores for select to anon using (status = 'active');
create policy "users create own stores" on public.stores for insert to authenticated with check (owner_id = auth.uid());
create policy "members edit stores" on public.stores for update to authenticated using (private.is_store_member(id) or owner_id = auth.uid()) with check (private.is_store_member(id) or owner_id = auth.uid());

create policy "members visible to same store" on public.store_members for select to authenticated using (private.is_store_member(store_id) or user_id = auth.uid());
create policy "owners create store members" on public.store_members for insert to authenticated with check (user_id = auth.uid() or private.is_store_member(store_id));
create policy "owners edit store members" on public.store_members for update to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "owners delete store members" on public.store_members for delete to authenticated using (private.is_store_member(store_id));

create policy "members manage products" on public.products for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "public products attached to active videos" on public.products for select to anon using (
  exists (
    select 1
    from public.video_products vp
    join public.videos v on v.id = vp.video_id
    join public.stores s on s.id = v.store_id
    where vp.product_id = products.id
      and v.status = 'active'
      and v.is_feed_enabled
      and s.status = 'active'
  )
);

create policy "members manage videos" on public.videos for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "active feed videos are public" on public.videos for select to anon using (
  status = 'active'
  and is_feed_enabled
  and exists (select 1 from public.stores s where s.id = videos.store_id and s.status = 'active')
);

create policy "members manage video products" on public.video_products for all to authenticated using (
  exists (select 1 from public.videos v where v.id = video_products.video_id and private.is_store_member(v.store_id))
) with check (
  exists (select 1 from public.videos v where v.id = video_products.video_id and private.is_store_member(v.store_id))
);
create policy "public video products for active videos" on public.video_products for select to anon using (
  exists (
    select 1
    from public.videos v
    join public.stores s on s.id = v.store_id
    where v.id = video_products.video_id
      and v.status = 'active'
      and v.is_feed_enabled
      and s.status = 'active'
  )
);

create policy "members manage widgets" on public.widgets for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "active widgets are public" on public.widgets for select to anon using (
  status = 'active'
  and exists (select 1 from public.stores s where s.id = widgets.store_id and s.status = 'active')
);

create policy "members manage custom pages" on public.custom_pages for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "active custom pages are public" on public.custom_pages for select to anon using (
  status = 'active'
  and exists (select 1 from public.stores s where s.id = custom_pages.store_id and s.status = 'active')
);

create policy "members manage custom page videos" on public.custom_page_videos for all to authenticated using (
  exists (
    select 1 from public.custom_pages cp
    where cp.id = custom_page_videos.page_id
      and private.is_store_member(cp.store_id)
  )
) with check (
  exists (
    select 1 from public.custom_pages cp
    where cp.id = custom_page_videos.page_id
      and private.is_store_member(cp.store_id)
  )
);
create policy "public custom page videos" on public.custom_page_videos for select to anon using (
  exists (
    select 1
    from public.custom_pages cp
    join public.stores s on s.id = cp.store_id
    where cp.id = custom_page_videos.page_id
      and cp.status = 'active'
      and s.status = 'active'
  )
);

create policy "members manage comments" on public.comments for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "approved comments are public" on public.comments for select to anon using (
  status = 'approved'
  and exists (
    select 1 from public.videos v
    join public.stores s on s.id = v.store_id
    where v.id = comments.video_id
      and v.status = 'active'
      and v.allow_comments
      and s.status = 'active'
  )
);
create policy "public can create pending comments when enabled" on public.comments for insert to anon with check (
  status = 'pending'
  and (author_email is null or length(author_email) <= 320)
  and exists (
    select 1 from public.videos v
    join public.stores s on s.id = v.store_id
    where v.id = comments.video_id
      and v.store_id = comments.store_id
      and v.status = 'active'
      and v.allow_comments
      and s.status = 'active'
  )
);

create policy "members read likes" on public.video_likes for select to authenticated using (private.is_store_member(store_id));
create policy "public can like active videos" on public.video_likes for insert to anon with check (
  visitor_id is not null
  and exists (
    select 1 from public.videos v
    join public.stores s on s.id = v.store_id
    where v.id = video_likes.video_id
      and v.store_id = video_likes.store_id
      and v.status = 'active'
      and v.allow_likes
      and s.status = 'active'
  )
);

create policy "members read analytics" on public.analytics_events for select to authenticated using (private.is_store_member(store_id));
create policy "public can insert analytics for active store" on public.analytics_events for insert to anon with check (
  exists (select 1 from public.stores s where s.id = analytics_events.store_id and s.status = 'active')
);

create policy "members manage integrations" on public.integrations for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));

create policy "plans are public" on public.plans for select to anon, authenticated using (true);
create policy "members read subscriptions" on public.subscriptions for select to authenticated using (private.is_store_member(store_id));
create policy "members create subscriptions" on public.subscriptions for insert to authenticated with check (private.is_store_member(store_id));
create policy "members update subscriptions" on public.subscriptions for update to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));

create policy "members manage feed settings" on public.feed_settings for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy "active feed settings are public" on public.feed_settings for select to anon using (
  is_active
  and exists (select 1 from public.stores s where s.id = feed_settings.store_id and s.status = 'active')
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.stores, public.products, public.videos, public.video_products, public.widgets, public.custom_pages, public.custom_page_videos, public.comments, public.plans, public.feed_settings to anon;
grant insert on public.comments, public.video_likes, public.analytics_events to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', true, 209715200, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('thumbnails', 'thumbnails', true, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('store-assets', 'store-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public can read public lupp assets" on storage.objects for select to anon, authenticated using (
  bucket_id in ('videos', 'thumbnails', 'store-assets')
);

create policy "members upload lupp assets" on storage.objects for insert to authenticated with check (
  bucket_id in ('videos', 'thumbnails', 'store-assets')
  and private.is_store_member(((storage.foldername(name))[1])::uuid)
);

create policy "members update lupp assets" on storage.objects for update to authenticated using (
  bucket_id in ('videos', 'thumbnails', 'store-assets')
  and private.is_store_member(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id in ('videos', 'thumbnails', 'store-assets')
  and private.is_store_member(((storage.foldername(name))[1])::uuid)
);

create policy "members delete lupp assets" on storage.objects for delete to authenticated using (
  bucket_id in ('videos', 'thumbnails', 'store-assets')
  and private.is_store_member(((storage.foldername(name))[1])::uuid)
);
