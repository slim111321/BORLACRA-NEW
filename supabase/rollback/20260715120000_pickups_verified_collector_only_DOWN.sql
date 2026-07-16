-- Rollback for supabase/migrations/20260715120000_pickups_verified_collector_only.sql
--
-- Supabase's CLI migration system is forward-only (no automatic "down"
-- migrations) — this file is the documented, manually-run reversal
-- procedure, kept OUTSIDE supabase/migrations/ so it is never picked up
-- and auto-applied by `supabase db push`/`db reset`.
--
-- To roll back: run this file's statements directly against the target
-- database (e.g. `supabase db execute -f supabase/rollback/20260715120000_pickups_verified_collector_only_DOWN.sql`,
-- or paste into the SQL editor). It only removes the trigger and function
-- this migration added — it does not touch any table, column, or data.
--
-- Safe to run even if the forward migration was never applied: both
-- statements use IF EXISTS / CASCADE-free drops that no-op cleanly.

drop trigger if exists trg_enforce_pickup_assignment_rules on public.pickups;
drop function if exists public.enforce_pickup_assignment_rules();
