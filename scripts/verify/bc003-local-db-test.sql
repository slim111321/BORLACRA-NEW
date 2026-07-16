-- Local-only integration test for
-- supabase/migrations/20260715120000_pickups_verified_collector_only.sql
-- Run against the local `supabase db start` instance only. Not for production.
\set ON_ERROR_STOP off

\echo '=== SETUP: seed test rows ==='
insert into public.profiles (id, role, is_verified) values
  ('11111111-1111-1111-1111-111111111111', 'COLLECTOR', true),   -- verified collector
  ('22222222-2222-2222-2222-222222222222', 'COLLECTOR', false),  -- UNverified collector
  ('33333333-3333-3333-3333-333333333333', 'CUSTOMER', false);   -- not even a collector

insert into public.pickups (id, status, collector_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pending', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pending', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'assigned', '11111111-1111-1111-1111-111111111111');

\echo ''
\echo '=== TEST 1: verified collector accepts a pending pickup -> MUST SUCCEED ==='
update public.pickups
  set status = 'assigned', collector_id = '11111111-1111-1111-1111-111111111111'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select 'TEST 1 result:' as label, status, collector_id from public.pickups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo ''
\echo '=== TEST 2: UNverified collector tries to accept a pending pickup -> MUST BE REJECTED ==='
update public.pickups
  set status = 'assigned', collector_id = '22222222-2222-2222-2222-222222222222'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select 'TEST 2 result (should be unchanged: pending/null):' as label, status, collector_id from public.pickups where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

\echo ''
\echo '=== TEST 3: non-collector role (CUSTOMER, even if is_verified were true) tries to accept -> MUST BE REJECTED ==='
update public.pickups
  set status = 'assigned', collector_id = '33333333-3333-3333-3333-333333333333'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select 'TEST 3 result (should still be unchanged: pending/null):' as label, status, collector_id from public.pickups where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

\echo ''
\echo '=== TEST 4: race condition - second accept attempt on an already-assigned pickup -> MUST BE REJECTED ==='
update public.pickups
  set status = 'assigned', collector_id = '22222222-2222-2222-2222-222222222222'
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select 'TEST 4 result (should still show original collector 1111...):' as label, status, collector_id from public.pickups where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

\echo ''
\echo '=== TEST 5: unrelated update (no collector_id/status-to-assigned change) is NOT blocked by the trigger ==='
update public.pickups set status = 'collected' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select 'TEST 5 result (should be collected):' as label, status, collector_id from public.pickups where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
