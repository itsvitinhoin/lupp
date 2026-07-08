create or replace function public.store_has_billing_access(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores st
    where st.id = check_store_id
      and st.status = 'active'
      and (
        coalesce(st.trial_ends_at, st.created_at + interval '7 days') > now()
        or exists (
          select 1
          from public.subscriptions sub
          where sub.store_id = st.id
            and sub.status in ('active', 'trialing', 'canceling')
            and (
              sub.current_period_end is null
              or sub.current_period_end > now()
            )
        )
      )
  );
$$;

grant execute on function public.store_has_billing_access(uuid) to anon, authenticated;
