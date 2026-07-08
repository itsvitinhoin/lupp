do $$
declare
  constraint_to_drop record;
begin
  for constraint_to_drop in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'video_products'
      and c.contype = 'u'
      and exists (
        select 1
        from unnest(c.conkey) with ordinality as key(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
        where a.attname = 'video_id'
      )
      and not exists (
        select 1
        from unnest(c.conkey) with ordinality as key(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
        where a.attname = 'product_id'
      )
  loop
    execute format(
      'alter table public.video_products drop constraint if exists %I',
      constraint_to_drop.conname
    );
  end loop;
end $$;

drop index if exists public.video_products_video_id_unique_idx;
drop index if exists public.video_products_one_product_idx;
drop index if exists public.video_products_primary_unique_idx;

alter table public.video_products
  drop constraint if exists video_products_unique;

alter table public.video_products
  add constraint video_products_unique unique (video_id, product_id);
