import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { Coordinate, GeocodeResult, MapProvider, RouteResult, RouteStep } from './types';

// Same public demo endpoints already used elsewhere in this codebase
// (utils/routing.ts's OSRM call, and the inline Nominatim calls this file
// replaces) — no API key or billing setup required. Neither has an uptime
// SLA, so every method here follows the existing convention: never throw
// on a failed/empty lookup, just return null / an empty array.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const REQUEST_TIMEOUT_MS = 8000;

function describeOsrmManeuver(maneuver: any, roadName: string): string {
  const type = maneuver?.type;
  const modifier = maneuver?.modifier;
  const road = roadName ? ` onto ${roadName}` : '';
  switch (type) {
    case 'depart':
      return `Head out${road}`;
    case 'arrive':
      return 'Arrive at your destination';
    case 'roundabout':
    case 'rotary':
      return `Enter the roundabout${road}`;
    case 'turn':
      return modifier ? `Turn ${modifier}${road}` : `Turn${road}`;
    case 'continue':
      return `Continue${road}`;
    case 'merge':
      return `Merge${road}`;
    case 'fork':
      return `Keep ${modifier || 'straight'}${road}`;
    case 'end of road':
      return `Turn ${modifier || ''}${road}`.trim();
    default:
      return `Continue${road}`;
  }
}

/** Splits a Nominatim `display_name` the same way the app's search UI already did, e.g. "Kasoa Market, Kasoa, Ghana" -> label "Kasoa Market", address "Kasoa, Ghana". */
function splitDisplayName(displayName: string): { label: string; address: string } {
  const parts = displayName.split(', ');
  return {
    label: parts[0] || displayName,
    address: parts.slice(1, 4).join(', '),
  };
}

async function getRoute(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
  try {
    const url = `${OSRM_BASE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=true`;
    const res = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number') return null;

    const geometry: Coordinate[] = (route.geometry?.coordinates || []).map((c: [number, number]) => ({
      latitude: c[1],
      longitude: c[0],
    }));

    const steps: RouteStep[] = (route.legs || []).flatMap((leg: any) =>
      (leg.steps || []).map((step: any) => ({
        instruction: describeOsrmManeuver(step.maneuver, step.name),
        distanceMeters: step.distance ?? 0,
        durationSeconds: step.duration ?? 0,
      })),
    );

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry,
      steps,
    };
  } catch (e) {
    console.warn('[maps/osm] getRoute failed:', e);
    return null;
  }
}

async function geocode(address: string): Promise<GeocodeResult[]> {
  if (!address || address.trim().length < 3) return [];
  try {
    // Biased toward Ghana for local relevance, matching the search box this
    // replaces; dedupe=1 avoids near-identical duplicate rows for one place.
    const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(address + ', Ghana')}&format=json&addressdetails=1&limit=8&countrycodes=gh&dedupe=1`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'BorlaApp/1.0' } }, REQUEST_TIMEOUT_MS);
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((result: any) => {
      const { label, address: addr } = splitDisplayName(result.display_name || '');
      return {
        id: String(result.place_id ?? `${result.lat},${result.lon}`),
        label,
        address: addr,
        coordinate: { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) },
      };
    });
  } catch (e) {
    console.warn('[maps/osm] geocode failed:', e);
    return [];
  }
}

async function reverseGeocode(coordinate: Coordinate): Promise<GeocodeResult | null> {
  try {
    const url = `${NOMINATIM_REVERSE_URL}?lat=${coordinate.latitude}&lon=${coordinate.longitude}&format=json`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'BorlaApp/1.0' } }, REQUEST_TIMEOUT_MS);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.error) return null;

    const a = data.address || {};
    const label = a.suburb || a.town || a.city || a.county || (data.display_name ? data.display_name.split(',')[0] : 'Location');
    const { address } = splitDisplayName(data.display_name || '');

    return {
      id: String(data.place_id ?? `${coordinate.latitude},${coordinate.longitude}`),
      label,
      address,
      coordinate,
    };
  } catch (e) {
    console.warn('[maps/osm] reverseGeocode failed:', e);
    return null;
  }
}

export const osmProvider: MapProvider = {
  name: 'osm',
  getRoute,
  geocode,
  reverseGeocode,
};
