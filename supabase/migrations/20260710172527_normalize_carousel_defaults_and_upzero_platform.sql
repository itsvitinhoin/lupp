create or replace function private.normalize_floating_widget_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_settings jsonb := coalesce(new.settings, '{}'::jsonb);
  default_display jsonb := jsonb_build_object(
    'mode', 'all',
    'include_paths', '[]'::jsonb,
    'exclude_paths', jsonb_build_array('/checkout', '/carrinho', '/cart'),
    'product_mode', 'linked_or_all',
    'hide_without_videos', false,
    'home_experience_enabled', true,
    'home_ordering', 'manual'
  );
  default_carousel jsonb := jsonb_build_object(
    'enabled', true,
    'title', 'Descubra cada detalhe e Compre',
    'description', '',
    'before_heading', 'Com Capa',
    'max_items', 12,
    'mobile_max_items', 6
  );
begin
  if new.type <> 'floating_video' then
    return new;
  end if;

  new.settings := current_settings || jsonb_build_object(
    'display', default_display || coalesce(current_settings -> 'display', '{}'::jsonb),
    'carousel', default_carousel || coalesce(current_settings -> 'carousel', '{}'::jsonb)
  );

  return new;
end;
$$;

drop trigger if exists normalize_floating_widget_settings on public.widgets;

create trigger normalize_floating_widget_settings
before insert or update of type, settings on public.widgets
for each row
execute function private.normalize_floating_widget_settings();

-- Backfill only missing keys. Explicit merchant choices, including
-- carousel.enabled = false, remain untouched because the current JSON wins.
update public.widgets
set settings = settings
where type = 'floating_video';

-- A store with one active commerce provider should reflect that provider in
-- stores.platform. This repairs old onboarding records without guessing when
-- multiple commerce integrations are active.
with single_active_provider as (
  select store_id, min(provider) as provider
  from public.integrations
  where status = 'active'
    and provider in ('upzero', 'nuvemshop', 'shopify')
  group by store_id
  having count(distinct provider) = 1
)
update public.stores as stores
set platform = providers.provider
from single_active_provider as providers
where stores.id = providers.store_id
  and stores.platform is distinct from providers.provider;

-- Lipcem is an UP Zero storefront and had been overwritten as Nuvemshop by
-- an older connection flow. Only repair it when its UP Zero integration is
-- still active, so this migration never manufactures credentials.
update public.stores as stores
set platform = 'upzero'
where stores.slug = 'lipcem'
  and exists (
    select 1
    from public.integrations as integrations
    where integrations.store_id = stores.id
      and integrations.provider = 'upzero'
      and integrations.status = 'active'
  )
  and stores.platform is distinct from 'upzero';
