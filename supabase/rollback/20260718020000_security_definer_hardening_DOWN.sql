-- Rollback for 20260718020000_security_definer_hardening.sql
-- Restores each function's exact original live body (pulled via
-- `supabase db dump` before this migration was written).

create or replace function public.process_payout(p_request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
    v_collector_id uuid;
    v_amount numeric;
begin
    select collector_id, amount into v_collector_id, v_amount from payout_requests where id = p_request_id;

    if (select wallet_balance from profiles where id = v_collector_id) < v_amount then
        raise exception 'Insufficient wallet balance';
    end if;
    update profiles set wallet_balance = wallet_balance - v_amount where id = v_collector_id;

    insert into wallet_transactions (collector_id, type, amount, reference)
    values (v_collector_id, 'WITHDRAWAL', -v_amount, p_request_id::text);

    update payout_requests set status = 'PAID', resolved_at = now() where id = p_request_id;
end;
$$;

grant all on function public.process_payout(uuid) to anon;
grant all on function public.process_payout(uuid) to authenticated;
grant all on function public.process_payout(uuid) to service_role;

create or replace function public.handle_pickup_completion()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'completed' and old.status != 'completed' then
    perform public.credit_collector_wallet(
      new.collector_id,
      new.pricing_ghs,
      100,
      'Auto-payout for Pickup #' || new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.credit_collector_wallet(p_collector_id uuid, p_wallet_amount numeric, p_loyalty_points integer, p_reference text)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.collector_wallets (collector_id, wallet_balance, loyalty_points, updated_at)
  values (p_collector_id, 0, 0, now()) on conflict (collector_id) do nothing;

  update public.collector_wallets
  set wallet_balance = wallet_balance + p_wallet_amount,
      loyalty_points = loyalty_points + p_loyalty_points,
      updated_at = now()
  where collector_id = p_collector_id;

  update public.profiles
  set wallet_balance = wallet_balance + p_wallet_amount,
      loyalty_points = loyalty_points + p_loyalty_points
  where id = p_collector_id;

  insert into public.wallet_transactions (collector_id, type, amount, reference)
  values (p_collector_id, 'EARNING', p_wallet_amount, p_reference);
end;
$$;

create or replace function public.dispatch_scheduled_pickups()
returns void
language plpgsql
security definer
as $$
declare
    sub record;
    new_next_date date;
begin
    for sub in
        select * from subscriptions
        where status = 'active'
        and (
            (next_pickup_date is not null and next_pickup_date <= current_date)
            or
            (next_pickup_date is null and trim(lower(day_of_week)) = trim(lower(to_char(current_date, 'Day'))))
        )
    loop
        insert into pickups (
            customer_id,
            pickup_location_name,
            trash_type,
            status,
            pricing_ghs,
            pickup_time
        ) values (
            sub.user_id,
            sub.collection_address,
            'Household',
            'pending',
            35,
            sub.time_window
        );

        if sub.frequency = 'weekly' then
            new_next_date := current_date + interval '1 week';
        elsif sub.frequency = 'bi-weekly' then
            new_next_date := current_date + interval '2 weeks';
        elsif sub.frequency = 'monthly' then
            new_next_date := current_date + interval '1 month';
        else
            new_next_date := current_date + interval '1 week';
        end if;

        update subscriptions
        set next_pickup_date = new_next_date
        where id = sub.id;

    end loop;
end;
$$;

create or replace function public.find_nearby_collectors(p_lat double precision, p_lng double precision, p_radius_miles double precision default 3.0)
returns table(collector_id uuid, latitude double precision, longitude double precision, distance_miles double precision, updated_at text)
language sql
stable
security definer
as $$
  select
    cl.collector_id,
    cl.latitude,
    cl.longitude,
    ST_Distance(cl.location_geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1609.344 as distance_miles,
    cl.updated_at::text
  from public.collector_locations cl
  where cl.is_online = true
    and ST_DWithin(
      cl.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_miles * 1609.344
    )
    and exists (
      select 1 from profiles p
      where p.id = cl.collector_id
        and p.role = 'COLLECTOR'
        and p.is_verified = true
    )
  order by distance_miles asc;
$$;

create or replace function public.is_verified_collector()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'COLLECTOR'
    and is_verified = true
    and onboarding_completed = true
  );
$$;
