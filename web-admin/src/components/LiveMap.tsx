import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';


interface LiveMapProps {
  collectorLocations: any[];
  activePickups: any[];
  heatmapData?: any[];
  showHeatmap?: boolean;
  // BC-021: accepted for prop-shape parity with MapboxLiveMap (App.tsx
  // picks whichever of the two is active and passes the same props to
  // either) but intentionally unused here — the unmet-demand heatmap layer
  // is Mapbox-only per the feature request; this Leaflet map is unaffected.
  unmetDemandData?: any[];
  showUnmetDemandHeatmap?: boolean;
}

declare global {
  interface Window {
    L: any;
  }
}


const LiveMap: React.FC<LiveMapProps> = ({ collectorLocations, activePickups, heatmapData = [], showHeatmap = false }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const pickupMarkersRef = useRef<{ [key: string]: L.Marker }>({});
  const heatmapLayerRef = useRef<any>(null);


  useEffect(() => {
    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map('live-map-container', {
        zoomControl: false,
        attributionControl: false
      }).setView([5.5319, -0.4281], 14); // Kasoa Central

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(mapRef.current);

      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Collector Markers
  useEffect(() => {
    if (!mapRef.current) return;

    collectorLocations.forEach((loc) => {
      const id = loc.collector_id;
      const latLng: [number, number] = [loc.latitude, loc.longitude];
      const status = loc.status || 'OFFLINE';


      const getMarkerColor = (s: string) => {
        switch (s?.toUpperCase()) {
          case 'ONLINE': return '#10b981'; // Green
          case 'BUSY': return '#f59e0b'; // Orange
          case 'MOVING': return '#3b82f6'; // Blue
          case 'AT_LANDFILL': return '#8b5cf6'; // Purple
          case 'IDLE': return '#ec4899'; // Pink
          default: return '#94a3b8'; // Slate
        }
      };

      const color = getMarkerColor(status);

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng(latLng);
        // Update icon color if needed
        const newIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div style="background: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px ${color}80;">
              <span style="font-size: 16px;">🚛</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        markersRef.current[id].setIcon(newIcon);
      } else {
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div style="background: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px ${color}80;">
              <span style="font-size: 16px;">🚛</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        markersRef.current[id] = L.marker(latLng, { icon })
          .addTo(mapRef.current!)
          .bindPopup(`<b>Collector:</b> ${loc.profiles?.full_name || 'Active Driver'}<br><b>Status:</b> ${status}`);
      }
    });


    // Remove old markers
    const activeIds = collectorLocations.map(l => l.collector_id);
    Object.keys(markersRef.current).forEach(id => {
      if (!activeIds.includes(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [collectorLocations]);

  // Update Pickup Markers
  useEffect(() => {
    if (!mapRef.current) return;

    activePickups.forEach((p) => {
      const id = p.id;
      // pickups' real columns are lat/lng, not latitude/longitude (see
      // App.tsx's insert + fetchLiveOpsData/fetchHeatmapData in the parent) —
      // reading the wrong field silently placed every pickup marker at
      // Leaflet's NaN fallback instead of its real location.
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const latLng: [number, number] = [p.lat, p.lng];

      if (!pickupMarkersRef.current[id]) {
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div style="background: #f59e0b; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(245,158,11,0.5);">
              <span style="font-size: 12px;">📦</span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        pickupMarkersRef.current[id] = L.marker(latLng, { icon })
          .addTo(mapRef.current!)
          .bindPopup(`<b>Pickup:</b> ${p.trash_type}<br><b>Status:</b> ${p.status}`);
      }
    });

    // Remove completed pickups
    const activePickupIds = activePickups.map(p => p.id);
    Object.keys(pickupMarkersRef.current).forEach(id => {
      if (!activePickupIds.includes(id)) {
        pickupMarkersRef.current[id].remove();
        delete pickupMarkersRef.current[id];
      }
    });
  }, [activePickups]);

  // Update Heatmap Layer
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing layer if it exists
    if (heatmapLayerRef.current) {
      mapRef.current.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }

    if (showHeatmap && heatmapData.length > 0) {
      const points = heatmapData.map(p => [p.latitude, p.longitude, p.intensity || 0.5]);
      // @ts-ignore
      heatmapLayerRef.current = window.L.heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' }
      }).addTo(mapRef.current);
    }
  }, [heatmapData, showHeatmap]);


  return <div id="live-map-container" style={{ width: '100%', height: 'calc(100vh - 200px)', borderRadius: '1.5rem', overflow: 'hidden', border: '1px solid #334155' }} />;
};

export default LiveMap;
