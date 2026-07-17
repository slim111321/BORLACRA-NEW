-- BC-019: tighten the two overlapping, loosely-scoped pickups UPDATE
-- policies, confirmed live via `supabase db dump --schema public` this
-- session (see supabase/SCHEMA_NOTES.md). Real, exact definitions pulled
-- from production:
--
--   "Collectors can claim and update pickups" — USING (
--     (status = 'pending' AND EXISTS(profiles.role = 'COLLECTOR'))
--     OR collector_id = auth.uid()
--     OR EXISTS(profiles.role = 'ADMIN')
--   )
--   "pickups_update" — USING (
--     collector_id = auth.uid()
--     OR (status = 'pending' AND profiles.role = 'COLLECTOR')
--     OR profiles.role = 'ADMIN'
--   )
--
-- Both let ANY authenticated user with role='COLLECTOR' claim ANY pending
-- pickup — no is_verified / onboarding_completed check. Because Postgres
-- OR-combines multiple PERMISSIVE policies for the same command, these two
-- fully neutralize the one correctly-scoped policy that already exists
-- ("pickups_update_collector_ops", which requires is_verified_collector()).
-- The BC-003 trigger (enforce_pickup_assignment_rules,
-- 20260715120000_pickups_verified_collector_only.sql) already independently
-- blocks an *unverified* collector from actually being assigned via
-- collector_id, so this was not exploitable for that specific case — but it
-- also matters for BC-018 (this session, previous migration): the payment
-- gating added there only actually holds if these loose policies can't
-- otherwise be used to touch a pickup that isn't the acting user's own.
-- Reproduced locally before this fix: an unrelated authenticated user
-- (neither the pickup's customer nor its collector) could update
-- payment_method on a pickup that wasn't theirs at all, purely because
-- these policies impose no ownership check on the "collector_id = auth.uid()"
-- branch's sibling clauses. Confirmed closed after this fix.
--
-- Cannot simply DROP both loose policies — "pickups_update_collector_ops"
-- only covers a pickup a collector is *already* assigned to
-- (collector_id = auth.uid()), not the initial claim of a still-pending
-- pickup (old.collector_id is NULL at that point). Dropping both outright
-- would break the core "accept a job" flow for every collector, verified or
-- not. Instead, the two redundant loose policies are replaced by one
-- consolidated policy that keeps every legitimate branch (own assigned
-- pickup, claim a pending pickup, admin override) but requires
-- is_verified_collector() for the claim branch and the existing is_admin()
-- helper for the admin branch, matching the tight policy's own standard.
--
-- Tested against a local Postgres fixture mirroring the exact real
-- pickup_status enum, is_admin()/is_verified_collector() functions, and all
-- six real pickups policies, before being applied live. See
-- migrations/README.md.

drop policy if exists "Collectors can claim and update pickups" on public.pickups;
drop policy if exists "pickups_update" on public.pickups;

create policy "pickups_update"
  on public.pickups
  for update
  to authenticated
  using (
    (collector_id = auth.uid())
    or (status = 'pending'::public.pickup_status and public.is_verified_collector())
    or public.is_admin()
  )
  with check (
    (collector_id = auth.uid())
    or (status = 'pending'::public.pickup_status and public.is_verified_collector())
    or public.is_admin()
  );
