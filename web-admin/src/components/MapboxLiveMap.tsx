import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mirrors LiveMap.tsx's prop shape exactly so the two are interchangeable —
// App.tsx picks one or the other based on VITE_MAP_PROVIDER. Rendering here
// uses mapbox-gl directly rather than the services/maps abstraction, since
// the abstraction only covers routing/geocoding, not visual map rendering
// (each provider's map widget is a fundamentally different library).
interface MapboxLiveMapProps {
  collectorLocations: any[];
  activePickups: any[];
  heatmapData?: any[];
  showHeatmap?: boolean;
  /** BC-021: unmet-demand points (zero-collector-found searches) — a
   * second, independently toggleable heatmap layer, visually distinct
   * (red/orange vs the pickup heatmap's blue-to-red ramp) so admins can
   * tell demand gaps apart from completed-pickup density at a glance. */
  unmetDemandData?: any[];
  showUnmetDemandHeatmap?: boolean;
}

const KASOA_CENTER: [number, number] = [-0.4281, 5.5319];

function getMarkerColor(status: string): string {
  switch (status?.toUpperCase()) {
    case 'ONLINE':
      return '#10b981';
    case 'BUSY':
      return '#f59e0b';
    case 'MOVING':
      return '#3b82f6';
    case 'AT_LANDFILL':
      return '#8b5cf6';
    case 'IDLE':
      return '#ec4899';
    default:
      return '#94a3b8';
  }
}

function collectorMarkerEl(color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `background: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px ${color}80;`;
  el.innerHTML = `<span style="font-size: 16px;">🚛</span>`;
  return el;
}

function pickupMarkerEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    'background: #f59e0b; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(245,158,11,0.5);';
  el.innerHTML = `<span style="font-size: 12px;">📦</span>`;
  return el;
}

const HEATMAP_SOURCE_ID = 'live-ops-heatmap-src';
const HEATMAP_LAYER_ID = 'live-ops-heatmap-layer';
const UNMET_DEMAND_SOURCE_ID = 'unmet-demand-heatmap-src';
const UNMET_DEMAND_LAYER_ID = 'unmet-demand-heatmap-layer';

/** Shared by both heatmap layers — adds/updates a GeoJSON heatmap source+layer, or clears it when `show` is false. */
function applyHeatmapLayer(
  map: mapboxgl.Map,
  sourceId: string,
  layerId: string,
  data: any[],
  show: boolean,
  colorRamp: (string | number)[],
) {
  const existingSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (show ? data : [])
      .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
      .map((p) => ({
        type: 'Feature',
        properties: { intensity: p.intensity ?? 0.5 },
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      })),
  };

  if (existingSource) {
    existingSource.setData(geojson);
    return;
  }

  if (!show || data.length === 0) return;

  map.addSource(sourceId, { type: 'geojson', data: geojson });
  map.addLayer({
    id: layerId,
    type: 'heatmap',
    source: sourceId,
    paint: {
      'heatmap-weight': ['get', 'intensity'],
      'heatmap-intensity': 1,
      'heatmap-radius': 25,
      'heatmap-opacity': 0.8,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...colorRamp],
    },
  });
}

const PICKUP_COLOR_RAMP = [0.4, 'blue', 0.6, 'cyan', 0.7, 'lime', 0.8, 'yellow', 1, 'red'];
const UNMET_DEMAND_COLOR_RAMP = [0.3, 'rgba(251,191,36,0)', 0.5, '#fbbf24', 0.75, '#f97316', 1, '#dc2626'];

const MapboxLiveMap: React.FC<MapboxLiveMapProps> = ({
  collectorLocations,
  activePickups,
  heatmapData = [],
  showHeatmap = false,
  unmetDemandData = [],
  showUnmetDemandHeatmap = false,
}) => {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const pickupMarkersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      setTokenMissing(true);
      return;
    }
    mapboxgl.accessToken = token;

    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        container: 'mapbox-live-map-container',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: KASOA_CENTER,
        zoom: 13,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('load', () => {
        styleLoadedRef.current = true;
      });
      mapRef.current = map;
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
  }, []);

  // Update collector markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    collectorLocations.forEach((loc) => {
      const id = loc.collector_id;
      // Defensive: mapboxgl.Marker.setLngLat() throws on non-finite
      // coordinates (unlike Leaflet, which fails silently) — a row with a
      // missing/null latitude or longitude would otherwise crash the map.
      if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
      const lngLat: [number, number] = [loc.longitude, loc.latitude];
      const status = loc.status || 'OFFLINE';
      const color = getMarkerColor(status);
      const popupHtml = `<b>Collector:</b> ${loc.profiles?.full_name || 'Active Driver'}<br/><b>Status:</b> ${status}`;

      if (markersRef.current[id]) {
        markersRef.current[id].setLngLat(lngLat);
        markersRef.current[id].getPopup()?.setHTML(popupHtml);
      } else {
        markersRef.current[id] = new mapboxgl.Marker({ element: collectorMarkerEl(color) })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupHtml))
          .addTo(map);
      }
    });

    const activeIds = collectorLocations.map((l) => l.collector_id);
    Object.keys(markersRef.current).forEach((id) => {
      if (!activeIds.includes(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [collectorLocations]);

  // Update pickup markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    activePickups.forEach((p) => {
      const id = p.id;
      // pickups' real columns are lat/lng (see App.tsx's insert + fetchHeatmapData's
      // own mapping below) — not latitude/longitude. Reading the wrong field
      // name here fed mapboxgl.Marker.setLngLat() undefined/NaN, which throws
      // "Invalid LngLat object" and used to crash/unmount the whole map.
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      if (!pickupMarkersRef.current[id]) {
        pickupMarkersRef.current[id] = new mapboxgl.Marker({ element: pickupMarkerEl() })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<b>Pickup:</b> ${p.trash_type}<br/><b>Status:</b> ${p.status}`))
          .addTo(map);
      }
    });

    const activePickupIds = activePickups.map((p) => p.id);
    Object.keys(pickupMarkersRef.current).forEach((id) => {
      if (!activePickupIds.includes(id)) {
        pickupMarkersRef.current[id].remove();
        delete pickupMarkersRef.current[id];
      }
    });
  }, [activePickups]);

  // Update pickup-density heatmap layer — mapbox-gl has a native 'heatmap'
  // layer type, no separate plugin needed (Leaflet's LiveMap relies on the
  // leaflet.heat plugin for this).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyHeatmapLayer(map, HEATMAP_SOURCE_ID, HEATMAP_LAYER_ID, heatmapData, showHeatmap, PICKUP_COLOR_RAMP);
    if (styleLoadedRef.current) apply();
    else map.once('load', apply);
  }, [heatmapData, showHeatmap]);

  // Update unmet-demand heatmap layer (BC-021) — independent toggle/source
  // from the pickup-density layer above, distinct color ramp.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyHeatmapLayer(map, UNMET_DEMAND_SOURCE_ID, UNMET_DEMAND_LAYER_ID, unmetDemandData, showUnmetDemandHeatmap, UNMET_DEMAND_COLOR_RAMP);
    if (styleLoadedRef.current) apply();
    else map.once('load', apply);
  }, [unmetDemandData, showUnmetDemandHeatmap]);

  if (tokenMissing) {
    return (
      <div
        style={{
          width: '100%',
          height: 'calc(100vh - 200px)',
          borderRadius: '1.5rem',
          border: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '0.9rem',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        VITE_MAP_PROVIDER is set to "mapbox" but VITE_MAPBOX_TOKEN is missing. Add it to web-admin/.env, or set VITE_MAP_PROVIDER=osm to use the OpenStreetMap map instead.
      </div>
    );
  }

  return <div id="mapbox-live-map-container" style={{ width: '100%', height: 'calc(100vh - 200px)', borderRadius: '1.5rem', overflow: 'hidden', border: '1px solid #334155' }} />;
};

export default MapboxLiveMap;
