alter table public.videos
  add column if not exists product_visibility_scope text not null default 'product',
  add column if not exists product_visibility_url text;

alter table public.videos
  drop constraint if exists videos_product_visibility_scope_check;

alter table public.videos
  add constraint videos_product_visibility_scope_check
  check (product_visibility_scope in ('product', 'variant'));
