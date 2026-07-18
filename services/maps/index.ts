import { MapProvider } from './types';
import { osmProvider } from './osm.provider';
import { mapboxProvider } from './mapbox.provider';
import { googleProvider } from './google.provider';

export * from './types';

type ProviderName = 'mapbox' | 'osm' | 'google';

const providers: Record<ProviderName, MapProvider> = {
  mapbox: mapboxProvider,
  osm: osmProvider,
  google: googleProvider,
};

function resolveProviderName(): ProviderName {
  const raw = (process.env.EXPO_PUBLIC_MAP_PROVIDER || 'mapbox').toLowerCase().trim();
  if (raw === 'mapbox' || raw === 'osm' || raw === 'google') return raw;
  console.warn(`[maps] Unknown EXPO_PUBLIC_MAP_PROVIDER "${raw}" — falling back to "mapbox". Valid values: mapbox | osm | google.`);
  return 'mapbox';
}

/**
 * The single map provider every screen/component should call for routing
 * and geocoding. Switch providers with one env var (EXPO_PUBLIC_MAP_PROVIDER
 * in .env.local) instead of changing code — defaults to "mapbox" if unset.
 */
export const activeMapProvider: MapProvider = providers[resolveProviderName()];
