alter table public.analytics_events
  drop constraint if exists analytics_events_type_check;

alter table public.analytics_events
  add constraint analytics_events_type_check
  check (
    event_type in (
      'video_view',
      'video_progress',
      'video_complete',
      'product_click',
      'add_to_cart_click',
      'share_click',
      'like_click',
      'comment_create',
      'widget_view',
      'feed_open',
      'launcher_impression',
      'feed_close'
    )
  );
