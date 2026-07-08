alter table public.videos
  drop constraint if exists videos_status_check;

alter table public.videos
  add constraint videos_status_check
  check (status in ('draft', 'active', 'paused', 'archived', 'deleted'));
