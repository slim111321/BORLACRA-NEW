import { fetchWithTimeout } from './fetchWithTimeout';

// Same public OSRM demo endpoint MapComponent.tsx already calls to draw
// live routes on the map — reusing it here means real distance/ETA needs no
// new API key or billing setup. It has no uptime SLA, so every caller must
// treat a null result as "unknown" and fall back gracefully, never throw.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTING_TIMEOUT_MS = 8000;

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
}

/** Real driving distance (km) and duration (minutes) between two points. Returns null on any failure. */
export async function getRouteDistanceAndDuration(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteEstimate | null> {
  try {
    const url = `${OSRM_BASE_URL}/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const res = await fetchWithTimeout(url, {}, ROUTING_TIMEOUT_MS);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number') return null;

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
    };
  } catch (e) {
    console.warn('[Routing] OSRM request failed:', e);
    return null;
  }
}

export function formatEtaMinutes(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} min`;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
