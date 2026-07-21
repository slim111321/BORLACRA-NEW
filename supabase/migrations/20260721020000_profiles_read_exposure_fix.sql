-- Task #15 from the production-readiness audit: profiles read exposure.
--
-- profiles had two SELECT policies that were bare USING(true) with no TO
-- restriction ("Enable read access for all profiles", "Customers can view
-- assigned collector profile"), fully neutralizing the one correctly-scoped
-- policy (profiles_read_own_or_admin) -- the same class of bug BC-019 found
-- on pickups. Anyone holding just the public anon key (already embedded in
-- the app, no login required) could read every user's phone number, live
-- GPS location, wallet balance, and KYC document URLs
-- (vehicle_details.kyc_docs/photo_url, confirmed via
-- web-admin/src/App.tsx) for every row in the table.
--
-- Fix: drop both loose policies, leaving profiles_read_own_or_admin (self
-- or is_admin()) as the only SELECT policy on the base table -- matches the
-- pattern already used everywhere else in this schema (landfills/
-- broadcasts/system_settings). web-admin's User Management dashboard is
-- unaffected: it always operates as a real ADMIN session, so is_admin()
-- already covers it with no code changes needed there.
--
-- For the app's legitimate cross-user reads (a customer seeing their
-- assigned collector's name/photo/vehicle info, a collector seeing their
-- customer's name/phone to make contact, the loyalty leaderboard), a
-- separate `profiles_public` view exposes only the specific columns those
-- features actually use (traced across every App.tsx/web-admin call site
-- this session) -- not the full row. vehicle_details has its two
-- known-private keys (kyc_docs, photo_url) stripped before exposure;
-- nothing else in it is treated as private since the app already shows
-- vehicle_type/vehicle_number to customers directly as separate columns.
-- Note: `rating_average`, which several call sites in App.tsx already
-- select/write, is not a real column on the live profiles table (confirmed
-- via `supabase db dump`) -- a pre-existing, unrelated bug, not introduced
-- or fixed here; the view simply doesn't include a column that doesn't
-- exist.
--
-- push_token is included here even though it's arguably not "public
-- profile info" -- App.tsx currently reads another party's push_token
-- client-side to call sendPushNotification directly
-- (utils/notifications.ts), so omitting it here would break real
-- notification delivery (chat messages, arrival alerts, convoy invites)
-- until that moves server-side into an edge function (tracked separately
-- as its own follow-up). Remove it from this view once that ships.
--
-- Not a security_invoker view: it's owned by postgres (bypasses RLS on the
-- base table, same trust boundary as any SECURITY DEFINER function in this
-- schema) specifically so it can expose a safe slice of every row, not just
-- the querying user's own. Grant is authenticated-only, not anon -- no
-- legitimate feature needs a fully unauthenticated reader to browse
-- profiles, and the mobile app requires login before reaching any screen
-- that uses this view.
--
-- Tested against a local Postgres fixture loaded from a real
-- `supabase db dump --schema public` before being applied live -- see
-- scripts/verify/critical-rls-local-db-test.sql.

drop policy if exists "Enable read access for all profiles" on public.profiles;
drop policy if exists "Customers can view assigned collector profile" on public.profiles;

create or replace view public.profiles_public as
select
  id,
  full_name,
  phone_number,
  avatar_url,
  role,
  loyalty_points,
  vehicle_type,
  vehicle_number,
  (vehicle_details - 'kyc_docs' - 'photo_url') as vehicle_details,
  push_token -- TODO: drop once push sending moves server-side, see PROJECT_STATE.md
from public.profiles;

grant select on public.profiles_public to authenticated;
