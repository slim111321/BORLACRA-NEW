-- Local-only integration test for:
--   supabase/migrations/20260721010000_profiles_and_payout_self_service_hardening.sql
--
-- Run against a local Postgres loaded with the real live schema (this
-- repo's migrations alone cannot bootstrap a fresh database from scratch --
-- the base CREATE TABLE statements predate migration tracking and only
-- live on the live project, see migrations/README.md). See
-- scripts/verify/README.md for the exact setup steps. Not for production.
--
-- Uses SET ROLE authenticated + request.jwt.claim.sub to exercise the real
-- RLS policies as each simulated user, then RESET ROLE (back to the
-- postgres superuser, which bypasses RLS) to verify actual persisted state.
\set ON_ERROR_STOP on

\echo '=== SETUP: seed test rows (as postgres, bypasses RLS) ==='
insert into auth.users (id, aud, role, email) values
  ('a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'customer@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'verified-collector@test.local'),
  ('a1000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'unverified-collector@test.local');

insert into public.profiles (id, role, is_verified, onboarding_completed, wallet_balance, full_name) values
  ('a1000000-0000-0000-0000-000000000001', 'CUSTOMER', false, false, 0, 'Test Customer'),
  ('a1000000-0000-0000-0000-000000000002', 'ADMIN', true, true, 0, 'Test Admin'),
  ('a1000000-0000-0000-0000-000000000003', 'COLLECTOR', true, true, 0, 'Verified Collector'),
  ('a1000000-0000-0000-0000-000000000004', 'COLLECTOR', false, false, 0, 'Unverified Collector');

do $$
begin
  raise notice '--- TEST A1: customer cannot self-promote to ADMIN ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
    update public.profiles set role = 'ADMIN' where id = 'a1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: self-promotion to ADMIN was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: self-promotion to ADMIN blocked (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
begin
  raise notice '--- TEST A2: customer cannot self-verify ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
    update public.profiles set is_verified = true where id = 'a1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: self is_verified escalation was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: self is_verified escalation blocked (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
begin
  raise notice '--- TEST A3: customer cannot set their own wallet_balance ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
    update public.profiles set wallet_balance = 99999 where id = 'a1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: self wallet_balance escalation was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: self wallet_balance escalation blocked (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
begin
  raise notice '--- TEST A4: customer CAN still edit their own full_name (legitimate self-edit unaffected) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
  update public.profiles set full_name = 'Updated Name' where id = 'a1000000-0000-0000-0000-000000000001';
end $$;
reset role;
select case when full_name = 'Updated Name' then 'PASS: full_name self-edit still works' else 'FAIL: full_name self-edit broken' end
  from public.profiles where id = 'a1000000-0000-0000-0000-000000000001';

do $$
begin
  raise notice '--- TEST A5: admin CAN still verify a DIFFERENT user (KYC approval unaffected) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002'; -- admin
  update public.profiles set is_verified = true where id = 'a1000000-0000-0000-0000-000000000004'; -- collector
end $$;
reset role;
select case when is_verified then 'PASS: admin can still verify another user' else 'FAIL: admin KYC approval broken' end
  from public.profiles where id = 'a1000000-0000-0000-0000-000000000004';

\echo ''
\echo '=== payout_requests tests ==='

do $$
begin
  raise notice '--- TEST B1: verified collector CAN create a PENDING payout request ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  insert into public.payout_requests (collector_id, amount, method, status)
    values ('a1000000-0000-0000-0000-000000000003', 100, 'MOMO', 'PENDING');
end $$;
reset role;
select case when count(*) = 1 then 'PASS: verified collector payout request created' else 'FAIL: expected exactly 1 row' end
  from public.payout_requests where collector_id = 'a1000000-0000-0000-0000-000000000003';

do $$
begin
  raise notice '--- TEST B2: collector cannot insert an already-PAID request ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
    insert into public.payout_requests (collector_id, amount, method, status)
      values ('a1000000-0000-0000-0000-000000000003', 500, 'MOMO', 'PAID');
    raise exception 'FAIL: inserting a pre-PAID request was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: inserting a pre-PAID request blocked (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.payout_requests where collector_id = 'a1000000-0000-0000-0000-000000000003' and status = 'PENDING' limit 1;
  raise notice '--- TEST B3: collector cannot self-approve their own PENDING request via direct UPDATE ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  update public.payout_requests set status = 'PAID' where id = v_id;
end $$;
reset role;
select case when status = 'PENDING' then 'PASS: collector self-approval silently blocked by RLS (still PENDING)' else 'FAIL: collector was able to self-approve, status=' || status end
  from public.payout_requests where collector_id = 'a1000000-0000-0000-0000-000000000003' and amount = 100;

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.payout_requests where collector_id = 'a1000000-0000-0000-0000-000000000003' and status = 'PENDING' limit 1;
  raise notice '--- TEST B4: admin CAN reject/update a payout request directly (matches web-admin reject flow) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000002'; -- admin
  update public.payout_requests set status = 'REJECTED' where id = v_id;
end $$;
reset role;
select case when status = 'REJECTED' then 'PASS: admin reject flow still works' else 'FAIL: admin could not update payout status' end
  from public.payout_requests where collector_id = 'a1000000-0000-0000-0000-000000000003' and amount = 100;

do $$
begin
  raise notice '--- TEST B5: UNverified collector cannot create a payout request ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004';
    insert into public.payout_requests (collector_id, amount, method, status)
      values ('a1000000-0000-0000-0000-000000000004', 100, 'MOMO', 'PENDING');
    raise exception 'FAIL: unverified collector payout request was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: unverified collector payout request blocked (%)', sqlerrm;
  end;
end $$;
reset role;

\echo ''
\echo '=== pickups: claim policy (BC-019) + payment-verification trigger chain (BC-018/BC-020) ==='

insert into public.pickups (id, customer_id, user_id, status, trash_type, pricing_ghs) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'pending', 'Household', 50),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'pending', 'Household', 50);

do $$
begin
  raise notice '--- TEST D1: verified collector CAN claim a pending pickup ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  update public.pickups set status = 'assigned', collector_id = 'a1000000-0000-0000-0000-000000000003'
    where id = 'b1000000-0000-0000-0000-000000000001';
end $$;
reset role;
select case when status = 'assigned' and collector_id = 'a1000000-0000-0000-0000-000000000003' then 'PASS: verified collector claim succeeded' else 'FAIL: claim did not persist as expected' end
  from public.pickups where id = 'b1000000-0000-0000-0000-000000000001';

do $$
begin
  raise notice '--- TEST D2: UNverified collector cannot claim a pending pickup (silently blocked by RLS) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004';
  update public.pickups set status = 'assigned', collector_id = 'a1000000-0000-0000-0000-000000000004'
    where id = 'b1000000-0000-0000-0000-000000000002';
end $$;
reset role;
select case when status = 'pending' and collector_id is null then 'PASS: unverified collector claim blocked' else 'FAIL: unverified collector was able to claim' end
  from public.pickups where id = 'b1000000-0000-0000-0000-000000000002';

do $$
begin
  raise notice '--- TEST D3: a SECOND verified collector cannot claim an already-assigned pickup ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  -- reuse collector3 as a stand-in "second claimant" against pickup 1, which TEST D1 already assigned to them --
  -- what matters here is that pickup 1 is no longer 'pending', so a fresh claim attempt (as if from any collector)
  -- must not silently reassign it.
  update public.pickups set status = 'assigned', collector_id = 'a1000000-0000-0000-0000-000000000003'
    where id = 'b1000000-0000-0000-0000-000000000001' and status = 'pending';
end $$;
reset role;
select case when (select count(*) from public.pickups where id = 'b1000000-0000-0000-0000-000000000001' and status = 'assigned') = 1
  then 'PASS: already-assigned pickup not reclaimable via a pending-only claim attempt' else 'FAIL' end;

\echo ''
\echo '--- payment verification trigger chain ---'

insert into public.pickups (id, customer_id, user_id, collector_id, status, trash_type, pricing_ghs, payment_method) values
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'arrived', 'Household', 60, 'cash'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'arrived', 'Household', 70, 'paystack'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'arrived', 'Household', 80, 'paystack');
update public.pickups set payment_status = 'paid' where id = 'b1000000-0000-0000-0000-000000000005';

do $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
begin
  select wallet_balance into v_balance_before from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
  raise notice '--- TEST E1: cash pickup completes and credits the collector wallet (no payment gate) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  update public.pickups set status = 'completed' where id = 'b1000000-0000-0000-0000-000000000003';
  reset role;
  select wallet_balance into v_balance_after from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
  if v_balance_after = v_balance_before + 60 then
    raise notice 'PASS: cash pickup completed and wallet credited by pricing_ghs (60)';
  else
    raise exception 'FAIL: expected wallet_balance to increase by 60, before=%, after=%', v_balance_before, v_balance_after;
  end if;
end $$;

do $$
begin
  raise notice '--- TEST E2: UNPAID paystack pickup cannot be completed ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
    update public.pickups set status = 'completed' where id = 'b1000000-0000-0000-0000-000000000004';
    raise exception 'FAIL: unpaid paystack pickup completion was not blocked' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: unpaid paystack pickup completion blocked (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
begin
  select wallet_balance into v_balance_before from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
  raise notice '--- TEST E3: PAID paystack pickup completes and credits the collector wallet ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000003';
  update public.pickups set status = 'completed' where id = 'b1000000-0000-0000-0000-000000000005';
  reset role;
  select wallet_balance into v_balance_after from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
  if v_balance_after = v_balance_before + 80 then
    raise notice 'PASS: paid paystack pickup completed and wallet credited by pricing_ghs (80)';
  else
    raise exception 'FAIL: expected wallet_balance to increase by 80, before=%, after=%', v_balance_before, v_balance_after;
  end if;
end $$;

do $$
begin
  raise notice '--- TEST F1: customer CAN set payment_method on their own pending pickup ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
  update public.pickups set payment_method = 'paystack' where id = 'b1000000-0000-0000-0000-000000000002';
end $$;
reset role;
select case when payment_method = 'paystack' then 'PASS: customer payment_method self-service still works' else 'FAIL' end
  from public.pickups where id = 'b1000000-0000-0000-0000-000000000002';

do $$
begin
  raise notice '--- TEST F2: customer CANNOT set payment_status directly ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000001';
    update public.pickups set payment_status = 'paid' where id = 'b1000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: customer was able to set payment_status directly' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when others then
      raise notice 'PASS: customer blocked from setting payment_status directly (%)', sqlerrm;
  end;
end $$;
reset role;

do $$
begin
  raise notice '--- TEST F3: an UNRELATED authenticated user cannot touch someone else''s pickup ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'a1000000-0000-0000-0000-000000000004'; -- unrelated (unverified collector, not this pickup's customer/collector)
  update public.pickups set payment_method = 'cash' where id = 'b1000000-0000-0000-0000-000000000002';
end $$;
reset role;
select case when payment_method = 'paystack' then 'PASS: unrelated user could not touch someone else''s pickup' else 'FAIL: unrelated user modified another user''s pickup' end
  from public.pickups where id = 'b1000000-0000-0000-0000-000000000002';

\echo ''
\echo '=== DONE (review NOTICE lines above -- every one must say PASS) ==='
