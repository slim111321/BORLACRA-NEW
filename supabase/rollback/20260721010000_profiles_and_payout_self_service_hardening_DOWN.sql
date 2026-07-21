-- Rollback for 20260721010000_profiles_and_payout_self_service_hardening.sql
-- Restores the exact original live state: drops the new profiles trigger
-- and function, and restores the single original payout_requests policy in
-- place of the four split ones. Intentionally restores the *original*
-- (vulnerable) state -- only use this if the forward migration itself
-- caused a regression that needs to be backed out immediately.

drop trigger if exists trg_enforce_profile_self_update_restrictions on public.profiles;
drop function if exists public.enforce_profile_self_update_restrictions();

drop policy if exists "payout_requests_select" on public.payout_requests;
drop policy if exists "payout_requests_insert" on public.payout_requests;
drop policy if exists "payout_requests_update_admin_only" on public.payout_requests;
drop policy if exists "payout_requests_delete_admin_only" on public.payout_requests;

create policy "payout_requests_manage_verified"
  on public.payout_requests
  using (((collector_id = auth.uid()) and public.is_verified_collector()) or public.is_admin());
