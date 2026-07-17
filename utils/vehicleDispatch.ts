import { supabase } from '../lib/supabase';
import { TrashVehicle, TrashType } from '../types';
import { getRouteDistanceAndDuration, formatEtaMinutes, formatDistanceKm } from './routing';
import { calculateVehiclePrice } from './pricing';

const SEARCH_RADIUS_MILES = 15.0;

interface GetVehicleOptionsParams {
  userLat: number;
  userLng: number;
  wasteBags?: number | null;
  recommendedVehicleName?: string | null;
}

/**
 * Builds the real, live Choose Vehicle card list: active vehicles from
 * trash_vehicles, each priced with the real distance to its nearest online
 * verified collector of that type and the real admin-configured surge
 * multiplier — no hardcoded price/ETA anywhere in this function.
 */
export async function getVehicleOptions({
  userLat,
  userLng,
  wasteBags = null,
  recommendedVehicleName = null,
}: GetVehicleOptionsParams): Promise<TrashVehicle[]> {
  const { data: vehicles, error } = await supabase
    .from('trash_vehicles')
    .select('*')
    .eq('active', true)
    .order('id');

  if (error || !vehicles) {
    console.error('[VehicleDispatch] Could not load trash_vehicles:', error?.message);
    return [];
  }

  const surgeMultiplier = await getSurgeMultiplierSafely(userLat, userLng);

  return Promise.all(
    vehicles.map(async (v: any) => {
      const { data: collectors, error: collectorsError } = await supabase.rpc('find_available_collectors_by_vehicle', {
        p_lat: userLat,
        p_lng: userLng,
        p_vehicle_name: v.name,
        p_radius_miles: SEARCH_RADIUS_MILES,
      });
      if (collectorsError) {
        console.warn(`[VehicleDispatch] nearby-collector lookup failed for ${v.name}:`, collectorsError.message);
      }

      const nearest = collectors && collectors.length > 0 ? collectors[0] : null;
      const route = nearest
        ? await getRouteDistanceAndDuration(nearest.latitude, nearest.longitude, userLat, userLng)
        : null;

      const distanceKm = route?.distanceKm ?? null;
      const priceValue = calculateVehiclePrice({
        basePriceGhs: Number(v.price_ghs) || 0,
        pricePerKm: Number(v.price_per_km) || 0,
        pricePerBag: Number(v.price_per_bag) || 0,
        distanceKm,
        wasteBags,
        surgeMultiplier,
      });

      const etaLabel = route
        ? formatEtaMinutes(route.durationMinutes)
        : nearest
          ? 'ETA unavailable'
          : 'Awaiting nearby collectors';

      return {
        id: String(v.id),
        name: v.name,
        capacity: v.capacity || '',
        description: v.description || '',
        icon: v.icon || '🚛',
        type: v.vehicle_type || '',
        price: `GH₵ ${priceValue.toFixed(2)}`,
        time: etaLabel,
        priceValue,
        etaLabel,
        distanceLabel: distanceKm != null ? formatDistanceKm(distanceKm) : '',
        nearbyCollectorCount: collectors?.length ?? 0,
        recommended: recommendedVehicleName != null && v.name === recommendedVehicleName,
      } as TrashVehicle;
    }),
  );
}

async function getSurgeMultiplierSafely(lat: number, lng: number): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_active_surge_multiplier', { p_lat: lat, p_lng: lng });
    if (error || data == null) return 1.0;
    const value = Number(data);
    return Number.isFinite(value) && value > 0 ? value : 1.0;
  } catch {
    return 1.0;
  }
}

/**
 * Maps an AI Trash Estimator recommendation (or, absent that, the
 * customer's selected trash type) to the exact trash_vehicles.name to flag
 * as "Recommended" on the Choose Vehicle screen.
 */
export function inferRecommendedVehicleName(
  aiRecommendedVehicle: string | null | undefined,
  trashType: TrashType | string | null | undefined,
): string {
  if (aiRecommendedVehicle === 'Tricycle') return 'Tricycle Truck';
  if (aiRecommendedVehicle === 'Mini Truck' || aiRecommendedVehicle === 'Pickup') return 'Mini Truck';
  if (aiRecommendedVehicle === 'Large Truck') return 'Large Trash Truck';

  if (trashType === TrashType.MARKET || trashType === TrashType.MIXED) return 'Mini Truck';
  return 'Tricycle Truck';
}
