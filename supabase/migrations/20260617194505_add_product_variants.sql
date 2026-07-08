create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  platform text not null default 'upzero',
  external_id text not null,
  sku text,
  color_name text,
  color_code text,
  color_hex text,
  size_name text,
  size_code text,
  price numeric,
  compare_at_price numeric,
  stock_qty int,
  image_url text,
  asset_id text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_status_check check (status in ('active', 'draft', 'archived')),
  constraint product_variants_unique unique (store_id, platform, external_id)
);

create index product_variants_store_id_idx on public.product_variants(store_id);
create index product_variants_product_id_idx on public.product_variants(product_id);
create index product_variants_external_id_idx on public.product_variants(platform, external_id);

create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;

create policy "members manage product variants"
on public.product_variants
for all
to authenticated
using (private.is_store_member(store_id))
with check (private.is_store_member(store_id));

create policy "public product variants attached to active videos"
on public.product_variants
for select
to anon
using (
  exists (
    select 1
    from public.video_products vp
    join public.videos v on v.id = vp.video_id
    join public.stores s on s.id = v.store_id
    where vp.product_id = product_variants.product_id
      and v.status = 'active'
      and (v.is_feed_enabled or v.is_product_page_enabled)
      and s.status = 'active'
  )
);

grant select, insert, update, delete on public.product_variants to authenticated;
grant select on public.product_variants to anon;
