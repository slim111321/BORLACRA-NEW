-- Choose Vehicle screen: real dispatch + dynamic pricing infrastructure.
--
-- Context: the customer-facing "Choose Vehicle" screen has always rendered
-- a hardcoded constants.ts array (TRASH_VEHICLES) with the same fixed price/
-- ETA for every customer regardless of location or collector availability.
-- `public.trash_vehicles` already exists live with 3 real, admin-relevant
-- rows (confirmed via `supabase db dump` — Tricycle Truck/GH40, Mini Truck/
-- GH85, Large Trash Truck/GH250) and `public.pickups.vehicle_id` already has
-- a live FK to it (`pickups_vehicle_id_fkey`) — the schema was clearly
-- designed for this flow, it was just never wired up from the client. This
-- migration extends that existing table rather than creating a parallel one.
--
-- Scope of this migration:
-- 1. Add price_per_km / price_per_bag / active to trash_vehicles so pricing
--    becomes a real formula (base + distance + waste-size) instead of a
--    flat number, fully admin-editable without an app release. Seeded with
--    modest placeholder per-km/per-bag rates proportional to each vehicle's
--    existing base price -- these are starter values, not a business
--    decision made on the admin's behalf; adjust directly in the
--    trash_vehicles table (or a future admin-panel pricing UI) at any time.
-- 2. find_available_collectors_by_vehicle(): a new SECURITY DEFINER RPC,
--    deliberately modeled on the existing find_nearby_collectors() function
--    (same tables, same is_online/is_verified/role checks, same PostGIS
--    distance calc) but additionally filtered by profiles.vehicle_type, so
--    the vehicle cards can show real "N collectors nearby" / real nearest-
--    collector distance per vehicle type. Added as a NEW function rather
--    than modifying find_nearby_collectors() or find_collectors_within_miles()
--    (both already used elsewhere) to avoid any risk to existing callers.
-- 3. get_active_surge_multiplier(): reads the real, already-admin-editable
--    system_settings.surge_settings row (auto_active / max_multiplier).
--    Returns 1.0 (no surge) whenever auto_active is false, which is the
--    real current production setting -- so this changes no visible pricing
--    today. surge_zones is currently empty, so the point-in-polygon branch
--    is inert until an admin defines a zone; it uses ST_GeomFromGeoJSON on
--    surge_zones.polygon_coordinates, which assumes zones are stored as
--    GeoJSON polygons.
--
-- Deliberately NOT in scope: the pickups broadcast/acceptance mechanism
-- (any online verified collector can still see and accept a pending pickup,
-- unchanged) and any admin UI for editing these values -- both are
-- consciously separate follow-ups, see supabase/migrations/README.md.

alter table public.trash_vehicles
  add column if not exists price_per_km numeric not null default 0,
  add column if not exists price_per_bag numeric not null default 0,
  add column if not exists active boolean not null default true;

comment on column public.trash_vehicles.price_per_km is
  'GHS charged per km of distance to the nearest matching collector. Admin-editable; 0 disables the distance component.';
comment on column public.trash_vehicles.price_per_bag is
  'GHS charged per bag/bin beyond the first (waste-size charge), only applied when the AI Trash Estimator provided a bin count. Admin-editable.';
comment on column public.trash_vehicles.active is
  'When false, the vehicle is hidden from the Choose Vehicle screen without deleting its pricing row.';

-- Seed placeholder per-km/per-bag rates, roughly proportional to each
-- vehicle's existing base price. Safe to change at any time; a rate of 0
-- fully disables that pricing component for a given vehicle.
update public.trash_vehicles set price_per_km = 1.5, price_per_bag = 5  where name = 'Tricycle Truck'     and price_per_km = 0;
update public.trash_vehicles set price_per_km = 2.5, price_per_bag = 8  where name = 'Mini Truck'         and price_per_km = 0;
update public.trash_vehicles set price_per_km = 4.0, price_per_bag = 15 where name = 'Large Trash Truck'  and price_per_km = 0;

create or replace function public.find_available_collectors_by_vehicle(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_name text,
  p_radius_miles double precision default 15.0
) returns table(
  collector_id uuid,
  latitude double precision,
  longitude double precision,
  distance_miles double precision,
  updated_at text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cl.collector_id,
    cl.latitude,
    cl.longitude,
    ST_Distance(cl.location_geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1609.344 as distance_miles,
    cl.updated_at::text
  from public.collector_locations cl
  join public.profiles p on p.id = cl.collector_id
  where cl.is_online = true
    and p.role = 'COLLECTOR'
    and p.is_verified = true
    and p.vehicle_type = p_vehicle_name
    and ST_DWithin(
      cl.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_miles * 1609.344
    )
  order by distance_miles asc;
$$;

comment on function public.find_available_collectors_by_vehicle(double precision, double precision, text, double precision) is
  'Choose Vehicle screen: online+verified collectors matching a specific vehicle type, nearest first. Modeled on find_nearby_collectors(), added separately to avoid touching its existing callers.';

grant execute on function public.find_available_collectors_by_vehicle(double precision, double precision, text, double precision) to anon, authenticated;

create or replace function public.get_active_surge_multiplier(
  p_lat double precision,
  p_lng double precision
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auto_active boolean;
  v_max_multiplier numeric;
  v_zone_multiplier numeric;
begin
  select
    coalesce((value->>'auto_active')::boolean, false),
    coalesce((value->>'max_multiplier')::numeric, 2.5)
  into v_auto_active, v_max_multiplier
  from public.system_settings
  where key = 'surge_settings';

  if not coalesce(v_auto_active, false) then
    return 1.0;
  end if;

  select max(sz.multiplier)
  into v_zone_multiplier
  from public.surge_zones sz
  where sz.is_active = true
    and sz.polygon_coordinates is not null
    and ST_Contains(
      ST_GeomFromGeoJSON(sz.polygon_coordinates::text),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    );

  return least(coalesce(v_zone_multiplier, 1.0), coalesce(v_max_multiplier, 2.5));
end;
$$;

comment on function public.get_active_surge_multiplier(double precision, double precision) is
  'Choose Vehicle screen: real surge multiplier for a pickup point, driven entirely by system_settings.surge_settings and surge_zones. Returns 1.0 (no surge) whenever surge_settings.auto_active is false, which is the real production setting today.';

grant execute on function public.get_active_surge_multiplier(double precision, double precision) to anon, authenticated;
