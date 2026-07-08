create index if not exists analytics_events_store_event_created_idx
  on public.analytics_events(store_id, event_type, created_at desc);

create or replace function public.get_store_monthly_usage(check_store_id uuid)
returns table (
  active_videos bigint,
  month_views bigint,
  active_widgets bigint
)
language sql
stable
as $$
  select
    (
      select count(*)
      from public.videos v
      where v.store_id = check_store_id
        and v.status = 'active'
    ) as active_videos,
    (
      select count(*)
      from public.analytics_events e
      where e.store_id = check_store_id
        and e.event_type = 'video_view'
        and e.created_at >= date_trunc('month', now())
    ) as month_views,
    (
      select count(*)
      from public.widgets w
      where w.store_id = check_store_id
        and w.status = 'active'
    ) as active_widgets;
$$;

grant execute on function public.get_store_monthly_usage(uuid) to authenticated;
