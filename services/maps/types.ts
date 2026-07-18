export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Ordered points describing the route path, for drawing a line on a map. */
  geometry: Coordinate[];
  steps: RouteStep[];
}

export interface GeocodeResult {
  id: string;
  /** Primary display line — a place name or the first address segment. */
  label: string;
  /** Fuller address / secondary display line. */
  address: string;
  coordinate: Coordinate;
}

/**
 * Shared contract every map provider (Mapbox, OSM, Google, ...) implements.
 * Screens/components should import `activeMapProvider` from `./index`
 * rather than a specific provider file, so switching providers is a
 * one-line env var change instead of a code change.
 *
 * Convention: a provider that runs a real lookup and finds nothing returns
 * null / an empty array — it never throws just because a search came back
 * empty (callers should treat null/[] as "unknown", not an error). A
 * provider may still throw for genuine configuration problems, such as a
 * missing API token or an unimplemented stub provider.
 */
export interface MapProvider {
  readonly name: 'mapbox' | 'osm' | 'google';
  getRoute(from: Coordinate, to: Coordinate): Promise<RouteResult | null>;
  geocode(address: string): Promise<GeocodeResult[]>;
  reverseGeocode(coordinate: Coordinate): Promise<GeocodeResult | null>;
}
