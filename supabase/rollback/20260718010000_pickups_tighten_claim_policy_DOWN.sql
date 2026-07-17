-- Rollback for 20260718010000_pickups_tighten_claim_policy.sql
-- Restores the original two loose policies exactly as they were live.

drop policy if exists "pickups_update" on public.pickups;

create policy "Collectors can claim and update pickups"
  on public.pickups
  for update
  using (
    ((status = 'pending'::public.pickup_status) and (exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'COLLECTOR'::text
    )))
    or (collector_id = auth.uid())
    or (exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'ADMIN'::text
    ))
  );

create policy "pickups_update"
  on public.pickups
  for update
  using (
    (collector_id = auth.uid())
    or ((status = 'pending'::public.pickup_status) and (
      (select profiles.role from public.profiles where profiles.id = auth.uid()) = 'COLLECTOR'::text
    ))
    or (
      (select profiles.role from public.profiles where profiles.id = auth.uid()) = 'ADMIN'::text
    )
  );
