import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { Coordinate, GeocodeResult, MapProvider, RouteResult, RouteStep } from './types';

const DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const GEOCODING_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const REQUEST_TIMEOUT_MS = 8000;

function getToken(): string {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'Mapbox provider is active (EXPO_PUBLIC_MAP_PROVIDER=mapbox) but EXPO_PUBLIC_MAPBOX_TOKEN is not set. Add it to your .env.local, or set EXPO_PUBLIC_MAP_PROVIDER=osm to use the free OpenStreetMap provider instead.',
    );
  }
  return token;
}

async function getRoute(from: Coordinate, to: Coordinate): Promise<RouteResult | null> {
  const token = getToken();
  try {
    const url = `${DIRECTIONS_BASE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?geometries=geojson&steps=true&overview=full&access_token=${token}`;
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
        instruction: step.maneuver?.instruction || 'Continue',
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
    console.warn('[maps/mapbox] getRoute failed:', e);
    return null;
  }
}

function toGeocodeResult(feature: any): GeocodeResult {
  const [lng, lat] = feature.center || [0, 0];
  return {
    id: String(feature.id ?? `${lat},${lng}`),
    label: feature.text || feature.place_name || 'Unknown location',
    address: feature.place_name || '',
    coordinate: { latitude: lat, longitude: lng },
  };
}

async function geocode(address: string): Promise<GeocodeResult[]> {
  if (!address || address.trim().length < 3) return [];
  const token = getToken();
  try {
    // country=gh biases results to Ghana, matching the OSM provider's
    // countrycodes=gh bias so switching providers doesn't change relevance.
    const url = `${GEOCODING_BASE_URL}/${encodeURIComponent(address)}.json?access_token=${token}&country=gh&limit=8`;
    const res = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data?.features)) return [];

    return data.features.map(toGeocodeResult);
  } catch (e) {
    console.warn('[maps/mapbox] geocode failed:', e);
    return [];
  }
}

async function reverseGeocode(coordinate: Coordinate): Promise<GeocodeResult | null> {
  const token = getToken();
  try {
    const url = `${GEOCODING_BASE_URL}/${coordinate.longitude},${coordinate.latitude}.json?access_token=${token}&limit=1`;
    const res = await fetchWithTimeout(url, {}, REQUEST_TIMEOUT_MS);
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    return toGeocodeResult(feature);
  } catch (e) {
    console.warn('[maps/mapbox] reverseGeocode failed:', e);
    return null;
  }
}

export const mapboxProvider: MapProvider = {
  name: 'mapbox',
  getRoute,
  geocode,
  reverseGeocode,
};
