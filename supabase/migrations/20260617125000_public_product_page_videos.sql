drop policy if exists "public products attached to active videos" on public.products;
create policy "public products attached to active videos" on public.products
  for select to anon
  using (
    exists (
      select 1
      from public.video_products vp
      join public.videos v on v.id = vp.video_id
      join public.stores s on s.id = v.store_id
      where vp.product_id = products.id
        and v.status = 'active'
        and (v.is_feed_enabled or v.is_product_page_enabled)
        and s.status = 'active'
    )
  );

drop policy if exists "active feed videos are public" on public.videos;
create policy "active feed or product videos are public" on public.videos
  for select to anon
  using (
    status = 'active'
    and (is_feed_enabled or is_product_page_enabled)
    and exists (
      select 1
      from public.stores s
      where s.id = videos.store_id
        and s.status = 'active'
    )
  );

drop policy if exists "public video products for active videos" on public.video_products;
create policy "public video products for active videos" on public.video_products
  for select to anon
  using (
    exists (
      select 1
      from public.videos v
      join public.stores s on s.id = v.store_id
      where v.id = video_products.video_id
        and v.status = 'active'
        and (v.is_feed_enabled or v.is_product_page_enabled)
        and s.status = 'active'
    )
  );
