insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', true, 209715200, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('thumbnails', 'thumbnails', true, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('store-assets', 'store-assets', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read public lupp assets" on storage.objects;
drop policy if exists "members upload lupp assets" on storage.objects;
drop policy if exists "members update lupp assets" on storage.objects;
drop policy if exists "members delete lupp assets" on storage.objects;

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
