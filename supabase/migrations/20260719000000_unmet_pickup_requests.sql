-- BC-021: unmet-demand tracking. Every time a customer's pickup-request
-- coverage check (find_collectors_within_miles) returns zero collectors,
-- log it here so admins can see where/when demand is going unmet, instead
-- of that moment vanishing the instant the "No Collectors Nearby" alert is
-- dismissed.
--
-- Deliberately separate from the existing missed_bookings table:
-- missed_bookings is the customer-facing opt-in "notify me" feature (only
-- written when the customer explicitly taps "Notify Me" on the alert);
-- unmet_pickup_requests is an admin-facing analytics table, written
-- unconditionally on every zero-result search regardless of what the
-- customer chooses. Purely additive — does not touch missed_bookings.

create table if not exists public.unmet_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  latitude double precision not null,
  longitude double precision not null,
  requested_at timestamptz not null default now(),
  radius_searched_miles double precision not null,
  resolved boolean not null default false
);

create index if not exists idx_unmet_pickup_requests_requested_at
  on public.unmet_pickup_requests (requested_at desc);

alter table public.unmet_pickup_requests enable row level security;

-- Customer can log their own unmet request. No select/update grant to
-- customers — this table is for admin analytics, not a customer-visible
-- history.
create policy "unmet_pickup_requests_insert_own"
  on public.unmet_pickup_requests
  for insert
  to authenticated
  with check (auth.uid() = customer_id);

-- Admin-only read + resolve, matching the is_admin() pattern used
-- elsewhere in this schema (landfills, broadcasts, system_settings, ...).
create policy "unmet_pickup_requests_select_admin"
  on public.unmet_pickup_requests
  for select
  to authenticated
  using (public.is_admin());

create policy "unmet_pickup_requests_update_admin"
  on public.unmet_pickup_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
