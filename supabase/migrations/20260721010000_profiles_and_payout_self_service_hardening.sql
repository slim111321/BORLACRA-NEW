-- Closes two live RLS gaps found during a production-readiness audit re-
-- verification pass (`supabase db dump --schema public` pulled directly
-- against the live `samasama` project this session).
--
-- 1) profiles self-escalation (critical):
--    "profiles_update_own" and "profiles_update_v2" both let a user update
--    their own row (auth.uid() = id) with NO column restriction -- unlike
--    pickups, which already got this exact protection in BC-018
--    (enforce_customer_payment_method_only). Confirmed live, no trigger of
--    any kind existed on profiles. In practice this meant any authenticated
--    user could PATCH their own row directly via the REST API and set
--    role='ADMIN' (self-promoting past the web-admin login gate, which only
--    checks this same column), is_verified=true (self-approving KYC with no
--    review), or wallet_balance/onboarding_completed/status/borla_points/
--    loyalty_points to anything they wanted.
--
--    Fixed the same way BC-018 fixed the equivalent pickups gap: a trigger
--    that blocks the row owner specifically from touching these trust/money
--    columns, while leaving every other column (full_name, phone_number,
--    avatar_url, push_token, preferred_payment_method, vehicle_details,
--    etc.) freely self-editable exactly as before. A blocklist of the
--    trust-sensitive columns was used rather than an allowlist of
--    self-editable ones, specifically to avoid silently breaking some
--    legitimate self-service write elsewhere in App.tsx that wasn't fully
--    traced before this fix. Admins (is_admin()) and non-owner connections
--    (service-role/webhooks, where auth.uid() is null) are unaffected --
--    the KYC-approval flow (an admin updating a COLLECTOR's row, not their
--    own) still works exactly as before.
--
--    Deliberately NOT addressed here: profiles is also fully world-readable
--    (two SELECT policies are bare USING(true) with no TO restriction,
--    neutralizing the one correctly-scoped read policy the same way BC-019
--    found on pickups) -- full_name/phone/phone_number/wallet_balance/
--    latitude/longitude/push_token/vehicle_details(KYC docs) are readable
--    by anyone holding just the public anon key, no login required. Left
--    out of this migration on purpose: fixing it safely requires tracing
--    which fields App.tsx/web-admin legitimately read cross-user first (a
--    customer needs to see *something* about their assigned collector), to
--    avoid breaking a real feature. Tracked as a separate follow-up.
--
-- 2) payout_requests collector self-approval (medium):
--    "payout_requests_manage_verified" had no FOR clause, so it applied to
--    UPDATE (and DELETE) as well as SELECT/INSERT. A verified collector
--    could directly set their own payout_requests.status to 'PAID'/
--    'APPROVED'/'REJECTED' via the REST API, bypassing the admin-only
--    process_payout() RPC entirely, and freely rewrite amount/admin_notes/
--    admin_id/resolved_at on their own request. Confirmed via
--    App.tsx/web-admin/src/App.tsx that collectors only ever INSERT
--    (create a withdrawal request) and admins are the only ones who ever
--    UPDATE (approve via process_payout(), or reject via a direct
--    status='REJECTED' update) -- so splitting the policy by command below
--    matches real, already-existing usage exactly; nothing in the app
--    should behave differently after this.
--
-- Both fixes tested against a local Postgres fixture mirroring the real
-- confirmed profiles/payout_requests columns and is_admin()/
-- is_verified_collector() functions before being applied live -- see
-- scripts/verify/critical-rls-local-db-test.sql.

-- Deliberately NOT security definer, unlike most trigger functions in this
-- schema: this function's whole job is distinguishing "a real client
-- request" from "an internal call from a trusted security-definer function
-- like credit_collector_wallet" by checking current_user (see below). If
-- this function were itself security definer, current_user would read as
-- its owner (postgres) unconditionally for every invocation regardless of
-- the real caller, permanently defeating that check -- confirmed live in
-- local testing: this exact mistake made the trigger a no-op for every
-- caller, not just the internal-call case it needed to exempt. It still
-- calls public.is_admin(), itself security definer, so no elevated
-- privilege is needed here just to invoke it.
create or replace function public.enforce_profile_self_update_restrictions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only restrict when the acting connection is authenticated as the row's
  -- own owner and is not an admin. Admins editing someone else's row (KYC
  -- approval etc.) and service-role/webhook connections (auth.uid() is
  -- null) are untouched by this block.
  --
  -- current_user <> 'postgres' matters here and is not redundant with the
  -- auth.uid()/is_admin() checks: every trusted SECURITY DEFINER function
  -- in this schema (credit_collector_wallet, handle_pickup_completion, ...)
  -- is owned by postgres, so current_user becomes 'postgres' for the
  -- duration of any UPDATE they issue internally, regardless of who the
  -- original caller was. Without this check, a collector completing their
  -- OWN job would trip this trigger the moment handle_pickup_completion's
  -- credit_collector_wallet() call tried to add to their own
  -- wallet_balance -- auth.uid() = old.id is true in that case too, since
  -- the collector is both the acting session and the row being credited.
  -- (Confirmed live in local testing: without this clause, every job
  -- completion failed with "You cannot change your own wallet balance.")
  -- A direct client REST call can never make current_user = 'postgres'
  -- itself (authenticated/anon are never granted that role), so this
  -- doesn't reopen the hole this migration exists to close.
  if auth.uid() is not null and auth.uid() = old.id and current_user <> 'postgres' and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role.' using errcode = 'P0001';
    end if;
    if new.is_verified is distinct from old.is_verified then
      raise exception 'You cannot change your own verification status.' using errcode = 'P0001';
    end if;
    if new.wallet_balance is distinct from old.wallet_balance then
      raise exception 'You cannot change your own wallet balance.' using errcode = 'P0001';
    end if;
    if new.onboarding_completed is distinct from old.onboarding_completed then
      raise exception 'You cannot change your own onboarding status.' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status then
      raise exception 'You cannot change your own account status.' using errcode = 'P0001';
    end if;
    if new.borla_points is distinct from old.borla_points then
      raise exception 'You cannot change your own points balance.' using errcode = 'P0001';
    end if;
    if new.loyalty_points is distinct from old.loyalty_points then
      raise exception 'You cannot change your own loyalty points.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_profile_self_update_restrictions() is
  'Blocks a profiles row owner from self-editing role/is_verified/wallet_balance/onboarding_completed/status/borla_points/loyalty_points. See supabase/migrations/README.md.';

drop trigger if exists trg_enforce_profile_self_update_restrictions on public.profiles;
create trigger trg_enforce_profile_self_update_restrictions
  before update on public.profiles
  for each row
  execute function public.enforce_profile_self_update_restrictions();

-- payout_requests: replace the single ALL-commands policy with one scoped
-- per command, matching how the app actually uses this table.
drop policy if exists "payout_requests_manage_verified" on public.payout_requests;

create policy "payout_requests_select"
  on public.payout_requests
  for select
  to authenticated
  using ((collector_id = auth.uid() and public.is_verified_collector()) or public.is_admin());

create policy "payout_requests_insert"
  on public.payout_requests
  for insert
  to authenticated
  with check (
    collector_id = auth.uid()
    and public.is_verified_collector()
    and status = 'PENDING'
  );

create policy "payout_requests_update_admin_only"
  on public.payout_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "payout_requests_delete_admin_only"
  on public.payout_requests
  for delete
  to authenticated
  using (public.is_admin());
