-- BC-003: server-side enforcement that only a verified collector can be
-- assigned to a pickup, and only while it is still 'pending' (closes the
-- same race condition tracked separately as BC-007 — both are the same
-- write, so they're fixed atomically together here).
--
-- Context / why a trigger instead of an RLS policy:
-- The live project could not be reached while writing this migration (see
-- ../SCHEMA_NOTES.md and ../migrations/README.md — the project is paused).
-- We therefore have no visibility into what RLS policies already exist on
-- `public.pickups`. Postgres evaluates multiple PERMISSIVE policies for the
-- same command with OR semantics, so adding another permissive policy here
-- could not be relied on to actually restrict anything if a looser existing
-- policy already allows the write. A BEFORE UPDATE trigger has none of that
-- ambiguity: it fires for every UPDATE regardless of which RLS policy (or
-- the service-role key, which bypasses RLS entirely) let the statement
-- through, so it is the only mechanism we can be confident actually
-- enforces this invariant without first auditing every existing policy.
--
-- Scope, deliberately narrow:
-- Only fires when a pickup is being assigned a collector (`collector_id` is
-- changing to a new non-null value while `status` is becoming 'assigned') —
-- confirmed to be exactly the write at App.tsx:4283-4286. It does not touch
-- any other update path (arrival, completion, pricing edits, etc.), and it
-- only reads columns directly confirmed in source: pickups.status,
-- pickups.collector_id, profiles.id, profiles.role, profiles.is_verified.
--
-- IMPORTANT — this migration has been reviewed for SQL correctness but has
-- NOT been applied or tested against the live database, because the
-- project is currently paused and unreachable. Apply with
-- `supabase db push` only after the project is unpaused, and validate in a
-- staging/branch environment first if one is available before applying to
-- production. See BC-003's implementation notes for the manual test plan.

create or replace function public.enforce_pickup_assignment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only run these checks at the moment a pickup is being assigned to a
  -- collector: collector_id is changing (including from NULL) and the row
  -- is transitioning to 'assigned'. Any other update (pricing, proof
  -- upload, arrival/completion status, etc.) is left untouched.
  if new.status = 'assigned'
     and new.collector_id is not null
     and new.collector_id is distinct from old.collector_id
  then

    -- 1. Race-condition guard (BC-007): the pickup must still be pending.
    --    A second collector's concurrent accept attempt will see
    --    old.status already advanced past 'pending' and be rejected here,
    --    instead of silently overwriting the first collector's assignment.
    if old.status is distinct from 'pending' then
      raise exception
        'This pickup is no longer available for assignment (current status: %). It may have already been accepted by another collector.',
        old.status
        using errcode = 'P0001';
    end if;

    -- 2. Verification guard (BC-003): the assigned collector must be a
    --    verified, active collector account.
    if not exists (
      select 1
      from public.profiles p
      where p.id = new.collector_id
        and p.role = 'COLLECTOR'
        and p.is_verified = true
    ) then
      raise exception
        'Collector % is not a verified collector and cannot be assigned to a pickup.',
        new.collector_id
        using errcode = 'P0001';
    end if;

  end if;

  return new;
end;
$$;

comment on function public.enforce_pickup_assignment_rules() is
  'BC-003/BC-007: blocks assigning a pickup to an unverified collector, and blocks assigning a pickup that is no longer pending. See supabase/migrations/README.md.';

drop trigger if exists trg_enforce_pickup_assignment_rules on public.pickups;

create trigger trg_enforce_pickup_assignment_rules
  before update on public.pickups
  for each row
  execute function public.enforce_pickup_assignment_rules();
