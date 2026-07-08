create unique index if not exists products_store_platform_external_full_unique
  on public.products(store_id, platform, external_id);
