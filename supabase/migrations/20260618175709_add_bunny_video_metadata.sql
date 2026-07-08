alter table public.videos
  add column if not exists provider_video_id text,
  add column if not exists playback_url text,
  add column if not exists processing_status text not null default 'ready',
  add column if not exists file_size bigint;

alter table public.videos
  drop constraint if exists videos_processing_status_check;

alter table public.videos
  add constraint videos_processing_status_check
  check (processing_status in ('uploading', 'processing', 'ready', 'failed', 'archived'));

create index if not exists videos_provider_video_id_idx
  on public.videos(provider, provider_video_id);

update public.videos
set
  playback_url = coalesce(playback_url, video_url),
  processing_status = case
    when status = 'archived' then 'archived'
    when video_url is null then 'failed'
    else 'ready'
  end
where playback_url is null
   or processing_status is null;
