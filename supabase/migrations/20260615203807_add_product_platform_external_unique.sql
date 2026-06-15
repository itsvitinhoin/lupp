create unique index if not exists products_store_platform_external_unique
  on public.products(store_id, platform, external_id)
  where external_id is not null and platform is not null;
