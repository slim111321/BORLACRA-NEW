-- BC-020: hardening pass on SECURITY DEFINER functions, found while
-- verifying admin-table RLS (BC-018/BC-019 follow-up). Pulled via a live
-- `supabase db dump --schema public` this session — these are the exact
-- real function bodies, only the specific fixes below are changed.
--
-- 1) process_payout(p_request_id) had NO authorization check at all, and
--    was GRANTed to `anon` and `authenticated` — meaning any caller, even
--    fully unauthenticated with just the public anon key already embedded
--    in the app, could call it directly via RPC and force ANY payout
--    request to be marked 'PAID' and deduct the collector's wallet balance,
--    completely bypassing the payout_requests RLS policy (irrelevant here
--    since SECURITY DEFINER functions run with the function owner's
--    privileges, not the caller's, and this function never itself checked
--    who was calling). It also had no idempotency guard — calling it twice
--    on the same request would deduct the wallet balance twice. Fixed:
--    requires is_admin(), requires payout_requests.status = 'PENDING'
--    (locked with FOR UPDATE to close the two-concurrent-calls race), and
--    EXECUTE is revoked from anon.
--
-- 2) handle_pickup_completion() — the actual trigger that credits a
--    collector's wallet the moment pickups.status becomes 'completed' — had
--    no awareness of the new payment_method/payment_status columns added by
--    BC-018. BC-018's client-side check in handleJobFinalize (App.tsx) is
--    only a UX guard; anyone calling the REST API directly (bypassing the
--    app) could still set status='completed' on a card/MoMo pickup that was
--    never actually paid, and this trigger would pay the collector anyway.
--    Fixed: the trigger itself now blocks the 'completed' transition for a
--    paystack-method pickup whose payment_status isn't 'paid' — this is the
--    real, unbypassable enforcement point BC-018 was meant to add.
--
-- 3) credit_collector_wallet, dispatch_scheduled_pickups,
--    find_nearby_collectors, is_verified_collector — all SECURITY DEFINER
--    with no `SET search_path`, a known Postgres/Supabase privilege-
--    escalation class (a caller-controlled search_path could redirect an
--    unqualified table reference inside the function to an attacker-created
--    object). Pinned to `public`, matching the pattern already used by
--    is_admin() and enforce_pickup_assignment_rules() elsewhere in this
--    schema. No behavioral change — same body, only the SET clause added
--    (find_nearby_collectors and credit_collector_wallet already
--    schema-qualify every table reference with `public.`, so this is pure
--    defense-in-depth for them; is_verified_collector() and
--    dispatch_scheduled_pickups() do not schema-qualify, so this closes a
--    real gap for those two).
--
-- Not touched: dispatch_scheduled_pickups()'s own business logic (only
-- search_path pinned) — it is not called from any client code found this
-- session (cron-only, likely invoked by pg_cron or an external scheduler
-- not present in this repository), so it's out of scope beyond hardening.

create or replace function public.process_payout(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_collector_id uuid;
    v_amount numeric;
    v_status text;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can process a payout.' using errcode = '42501';
    end if;

    select collector_id, amount, status into v_collector_id, v_amount, v_status
    from payout_requests
    where id = p_request_id
    for update;

    if v_collector_id is null then
        raise exception 'Payout request not found.';
    end if;

    if v_status is distinct from 'PENDING' then
        raise exception 'This payout request has already been processed (status: %).', v_status;
    end if;

    if (select wallet_balance from profiles where id = v_collector_id) < v_amount then
        raise exception 'Insufficient wallet balance';
    end if;

    update profiles set wallet_balance = wallet_balance - v_amount where id = v_collector_id;

    insert into wallet_transactions (collector_id, type, amount, reference)
    values (v_collector_id, 'WITHDRAWAL', -v_amount, p_request_id::text);

    update payout_requests set status = 'PAID', resolved_at = now() where id = p_request_id;
end;
$$;

revoke all on function public.process_payout(uuid) from public;
revoke all on function public.process_payout(uuid) from anon;
grant execute on function public.process_payout(uuid) to authenticated;
grant execute on function public.process_payout(uuid) to service_role;

create or replace function public.handle_pickup_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status != 'completed' then
    if new.payment_method = 'paystack' and new.payment_status is distinct from 'paid' then
      raise exception 'This pickup cannot be completed until the customer''s card/MoMo payment is confirmed.'
        using errcode = 'P0001';
    end if;
    -- Pay the collector: (ID, Amount, Points, Reference)
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'COLLECTOR'
    and is_verified = true
    and onboarding_completed = true
  );
$$;
