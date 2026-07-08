alter table public.stores
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

alter table public.subscriptions
  add column if not exists discount_coupon_id uuid,
  add column if not exists discount_code text,
  add column if not exists discount_percent numeric,
  add column if not exists discount_amount numeric;

create table if not exists public.discount_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  description text,
  percent_off numeric,
  amount_off numeric,
  duration text not null default 'once',
  max_redemptions integer,
  redemption_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_coupons_discount_check check (
    (percent_off is not null and percent_off > 0 and percent_off <= 100 and amount_off is null)
    or
    (amount_off is not null and amount_off > 0 and percent_off is null)
  ),
  constraint discount_coupons_duration_check check (duration in ('once', 'forever'))
);

create trigger discount_coupons_set_updated_at
before update on public.discount_coupons
for each row execute function public.set_updated_at();

create index if not exists discount_coupons_code_idx
  on public.discount_coupons (upper(code));

create unique index if not exists discount_coupons_code_upper_unique
  on public.discount_coupons (upper(code));

create index if not exists subscriptions_discount_coupon_id_idx
  on public.subscriptions(discount_coupon_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_discount_coupon_id_fkey;

alter table public.subscriptions
  add constraint subscriptions_discount_coupon_id_fkey
  foreign key (discount_coupon_id)
  references public.discount_coupons(id)
  on delete set null;

update public.stores
set
  trial_started_at = coalesce(trial_started_at, created_at),
  trial_ends_at = coalesce(
    trial_ends_at,
    (
      select min(s.current_period_end)
      from public.subscriptions s
      where s.store_id = stores.id
        and s.status = 'trialing'
    ),
    created_at + interval '7 days'
  )
where trial_started_at is null
   or trial_ends_at is null;

update public.subscriptions
set current_period_end = least(current_period_end, current_period_start + interval '7 days')
where status = 'trialing'
  and current_period_start is not null
  and current_period_end is not null
  and current_period_end > current_period_start + interval '7 days';

create or replace function public.store_has_billing_access(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores st
    where st.id = check_store_id
      and st.status = 'active'
      and (
        coalesce(st.trial_ends_at, st.created_at + interval '7 days') > now()
        or exists (
          select 1
          from public.subscriptions sub
          where sub.store_id = st.id
            and sub.status in ('active', 'trialing')
            and (
              sub.status = 'active'
              or sub.current_period_end is null
              or sub.current_period_end > now()
            )
        )
      )
  );
$$;

alter table public.discount_coupons enable row level security;

drop policy if exists "members read discount coupons" on public.discount_coupons;
create policy "members read discount coupons"
on public.discount_coupons
for select
to authenticated
using (true);

drop policy if exists "public products attached to active videos" on public.products;
create policy "public products attached to active videos"
on public.products
for select
to anon
using (
  exists (
    select 1
    from public.video_products vp
    join public.videos v on v.id = vp.video_id
    where vp.product_id = products.id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "public product variants attached to active videos" on public.product_variants;
create policy "public product variants attached to active videos"
on public.product_variants
for select
to anon
using (
  exists (
    select 1
    from public.video_products vp
    join public.videos v on v.id = vp.video_id
    where vp.product_id = product_variants.product_id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "active feed videos are public" on public.videos;
drop policy if exists "active feed or product videos are public" on public.videos;
create policy "active feed or product videos are public"
on public.videos
for select
to anon
using (
  status = 'active'
  and (is_feed_enabled or is_product_page_enabled)
  and public.store_has_billing_access(store_id)
);

drop policy if exists "public video products for active videos" on public.video_products;
create policy "public video products for active videos"
on public.video_products
for select
to anon
using (
  exists (
    select 1
    from public.videos v
    where v.id = video_products.video_id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "active widgets are public" on public.widgets;
create policy "active widgets are public"
on public.widgets
for select
to anon
using (
  status = 'active'
  and public.store_has_billing_access(store_id)
);

drop policy if exists "active custom pages are public" on public.custom_pages;
create policy "active custom pages are public"
on public.custom_pages
for select
to anon
using (
  status = 'active'
  and public.store_has_billing_access(store_id)
);

drop policy if exists "active custom page videos are public" on public.custom_page_videos;
drop policy if exists "public custom page videos" on public.custom_page_videos;
create policy "active custom page videos are public"
on public.custom_page_videos
for select
to anon
using (
  exists (
    select 1
    from public.custom_pages cp
    where cp.id = custom_page_videos.page_id
      and cp.status = 'active'
      and public.store_has_billing_access(cp.store_id)
  )
);

drop policy if exists "public can read approved comments" on public.comments;
drop policy if exists "public approved comments for active videos" on public.comments;
drop policy if exists "approved comments are public" on public.comments;
create policy "public approved comments for active videos"
on public.comments
for select
to anon
using (
  status = 'approved'
  and exists (
    select 1
    from public.videos v
    where v.id = comments.video_id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "public can create pending comments when enabled" on public.comments;
create policy "public can create pending comments when enabled"
on public.comments
for insert
to anon
with check (
  status = 'pending'
  and public.store_has_billing_access(store_id)
  and exists (
    select 1
    from public.videos v
    where v.id = comments.video_id
      and v.status = 'active'
      and v.allow_comments
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "public can read likes" on public.video_likes;
drop policy if exists "public likes for active videos" on public.video_likes;
create policy "public likes for active videos"
on public.video_likes
for select
to anon
using (
  exists (
    select 1
    from public.videos v
    where v.id = video_likes.video_id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "public can like active videos" on public.video_likes;
create policy "public can like active videos"
on public.video_likes
for insert
to anon
with check (
  exists (
    select 1
    from public.videos v
    where v.id = video_likes.video_id
      and v.status = 'active'
      and public.store_has_billing_access(v.store_id)
  )
);

drop policy if exists "public can insert analytics for active store" on public.analytics_events;
create policy "public can insert analytics for active store"
on public.analytics_events
for insert
to anon
with check (public.store_has_billing_access(store_id));

drop policy if exists "active feed settings are public" on public.feed_settings;
create policy "active feed settings are public"
on public.feed_settings
for select
to anon
using (
  is_active
  and public.store_has_billing_access(store_id)
);

grant select on public.discount_coupons to authenticated;
grant execute on function public.store_has_billing_access(uuid) to anon, authenticated;
