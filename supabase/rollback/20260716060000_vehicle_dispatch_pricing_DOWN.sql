-- Rollback for 20260716060000_vehicle_dispatch_pricing.sql
-- Drops the two new RPCs and the three new trash_vehicles columns.
-- Does NOT touch pre-existing trash_vehicles rows/columns or any other table.

drop function if exists public.get_active_surge_multiplier(double precision, double precision);
drop function if exists public.find_available_collectors_by_vehicle(double precision, double precision, text, double precision);

alter table public.trash_vehicles
  drop column if exists active,
  drop column if exists price_per_bag,
  drop column if exists price_per_km;
