-- Rollback for 20260721020000_profiles_read_exposure_fix.sql
-- Restores the original (world-readable) policies exactly and drops the
-- view. Only use this if the forward migration itself caused a regression
-- that needs to be backed out immediately -- restores the read-exposure
-- hole this migration exists to close.

drop view if exists public.profiles_public;

create policy "Enable read access for all profiles"
  on public.profiles
  for select
  using (true);

create policy "Customers can view assigned collector profile"
  on public.profiles
  for select
  using (true);
