import type { Coordinate, GeocodeResult, MapProvider, RouteResult } from './types';

const NOT_CONFIGURED_MESSAGE =
  'Google Maps provider is not yet configured. Add a Google Maps API key and implement services/maps/google.provider.ts (Directions API + Geocoding API), then set VITE_MAP_PROVIDER=google. Until then, use "mapbox" or "osm".';

async function getRoute(_from: Coordinate, _to: Coordinate): Promise<RouteResult | null> {
  throw new Error(NOT_CONFIGURED_MESSAGE);
}

async function geocode(_address: string): Promise<GeocodeResult[]> {
  throw new Error(NOT_CONFIGURED_MESSAGE);
}

async function reverseGeocode(_coordinate: Coordinate): Promise<GeocodeResult | null> {
  throw new Error(NOT_CONFIGURED_MESSAGE);
}

export const googleProvider: MapProvider = {
  name: 'google',
  getRoute,
  geocode,
  reverseGeocode,
};
