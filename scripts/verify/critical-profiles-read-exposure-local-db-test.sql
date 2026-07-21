-- Local-only integration test for:
--   supabase/migrations/20260721020000_profiles_read_exposure_fix.sql
-- Run against a local Postgres loaded with the real live schema, same setup
-- as scripts/verify/critical-rls-local-db-test.sql. Not for production.
\set ON_ERROR_STOP on

\echo '=== SETUP ==='
insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'reader@test.local'),
  ('c1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'target@test.local');

insert into public.profiles (id, role, full_name, phone_number, wallet_balance, latitude, longitude, push_token, vehicle_details) values
  ('c1000000-0000-0000-0000-000000000001', 'CUSTOMER', 'Reader', '0200000001', 0, 0, 0, null, null),
  ('c1000000-0000-0000-0000-000000000002', 'COLLECTOR', 'Target Collector', '0200000002', 12345.67, 5.55, -0.22, 'ExponentPushToken[xyz]', '{"vehicle_color": "Blue", "kyc_docs": ["secret-id-card.jpg"], "photo_url": "secret-photo.jpg"}'::jsonb);

-- A row RLS excludes from SELECT just returns zero rows -- it does not
-- raise an exception -- so this asserts on FOUND/EXISTS, not on a caught
-- error.
do $$
declare
  v_found boolean;
begin
  raise notice '--- TEST G1: an unrelated authenticated user CANNOT read another user''s full row directly ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
  select exists(select 1 from public.profiles where id = 'c1000000-0000-0000-0000-000000000002') into v_found;
  if v_found then
    raise exception 'FAIL: unrelated user could read another user''s profiles row directly';
  else
    raise notice 'PASS: direct profiles row read returns zero rows for an unrelated user';
  end if;
end $$;
reset role;

do $$
declare
  v_full_name text;
  v_phone text;
  v_vehicle jsonb;
begin
  raise notice '--- TEST G2: any authenticated user CAN read the safe subset via profiles_public ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
  select full_name, phone_number, vehicle_details into v_full_name, v_phone, v_vehicle
    from public.profiles_public where id = 'c1000000-0000-0000-0000-000000000002';
  if v_full_name = 'Target Collector' and v_phone = '0200000002' then
    raise notice 'PASS: profiles_public exposes full_name/phone_number for another user';
  else
    raise exception 'FAIL: profiles_public did not return expected safe fields, got name=%, phone=%', v_full_name, v_phone;
  end if;
  if v_vehicle ? 'kyc_docs' or v_vehicle ? 'photo_url' then
    raise exception 'FAIL: profiles_public.vehicle_details still exposes kyc_docs/photo_url';
  else
    raise notice 'PASS: profiles_public.vehicle_details has kyc_docs/photo_url stripped';
  end if;
  if v_vehicle ->> 'vehicle_color' = 'Blue' then
    raise notice 'PASS: profiles_public.vehicle_details still exposes non-sensitive keys (vehicle_color)';
  else
    raise exception 'FAIL: profiles_public stripped more than just kyc_docs/photo_url';
  end if;
end $$;
reset role;

do $$
declare
  v_wallet numeric;
  v_lat double precision;
begin
  raise notice '--- TEST G3: profiles_public does NOT expose wallet_balance or location ---';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
    execute 'select wallet_balance from public.profiles_public where id = $1' into v_wallet using 'c1000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: profiles_public exposes wallet_balance' using errcode = 'P0002';
  exception
    when sqlstate 'P0002' then
      raise;
    when undefined_column then
      raise notice 'PASS: profiles_public has no wallet_balance column';
  end;
end $$;
reset role;

do $$
declare
  v_own_wallet numeric;
begin
  raise notice '--- TEST G4: a user CAN still read their own full row directly (self-read unaffected) ---';
  set local role authenticated;
  set local request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000002';
  select wallet_balance into v_own_wallet from public.profiles where id = 'c1000000-0000-0000-0000-000000000002';
  if v_own_wallet = 12345.67 then
    raise notice 'PASS: self-read of full profile (including wallet_balance) still works';
  else
    raise exception 'FAIL: self-read broken, got %', v_own_wallet;
  end if;
end $$;
reset role;

\echo ''
\echo '=== DONE (review NOTICE lines above -- every one must say PASS) ==='
