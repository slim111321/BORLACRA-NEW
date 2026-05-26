import React, { useMemo, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

const MILES_TO_METERS = 1609.34;
const COVERAGE_RADIUS_MILES = 3;

export interface CollectorPin {
  collector_id: string;
  latitude: number;
  longitude: number;
  distance_miles: number;
}

interface MapComponentProps {
  userLatitude?: number;
  userLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  collectors?: CollectorPin[];
  showRoute?: boolean;
  driverProgress?: number;
  showHeatmap?: boolean;
  onRegionChange?: (region: any) => void;
}

// Default to Kasoa, Ghana if no GPS yet
const DEFAULT_LAT = 5.5319;
const DEFAULT_LNG = -0.4281;

export const MapComponent: React.FC<MapComponentProps> = ({
  userLatitude,
  userLongitude,
  destinationLatitude,
  destinationLongitude,
  collectors = [],
  showRoute = false,
  showHeatmap = false,
}) => {
  const webViewRef = useRef<WebView>(null);
  const centerLat = userLatitude ?? DEFAULT_LAT;
  const centerLng = userLongitude ?? DEFAULT_LNG;
  const hasRealLocation = userLatitude != null && userLongitude != null;

  const collectorsJSON = useMemo(() => JSON.stringify(
    collectors.map(c => ({
      id: c.collector_id,
      lat: c.latitude,
      lng: c.longitude,
      label: `${c.distance_miles.toFixed(1)} mi away`,
    }))
  ), [collectors]);

  // Update markers via JS injection instead of full reload
  useEffect(() => {
    const js = `
      if (window.updateCollectors) {
        window.updateCollectors(${collectorsJSON});
      }
      if (window.updateUserLocation) {
        window.updateUserLocation(${centerLat}, ${centerLng}, ${showRoute ? 'true' : 'false'});
      }
      if (window.updateDestinationLocation) {
        window.updateDestinationLocation(${destinationLatitude || 'null'}, ${destinationLongitude || 'null'});
      }
      if (window.updateHeatmap) {
        window.updateHeatmap(${showHeatmap ? 'true' : 'false'});
      }
    `;
    webViewRef.current?.injectJavaScript(js);
  }, [collectorsJSON, centerLat, centerLng, destinationLatitude, destinationLongitude]);

  const coverageRadiusMeters = COVERAGE_RADIUS_MILES * MILES_TO_METERS;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #e8f0e9; }

    .leaflet-marker-icon {
      transition: transform 1s linear; /* Smooth movement animation */
    }

    .user-pulse-outer {
      width: 22px; height: 22px;
      background: rgba(6,193,103,0.25);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      animation: pulse 2s ease-in-out infinite;
    }
    .user-pulse-inner {
      width: 12px; height: 12px;
      background: #06C167;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 6px rgba(6,193,103,0.8);
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.7; }
    }

    .collector-icon {
      background: white;
      border: 2px solid #06C167;
      border-radius: 50%;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .dest-icon {
      font-size: 24px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
    }).setView([${centerLat}, ${centerLng}], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(map);

    map.on('moveend', function() {
      const center = map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REGION_CHANGE', lat: center.lat, lng: center.lng }));
    });

    let markers = {};

    function updateCollectors(data) {
      data.forEach(c => {
        if (markers[c.id]) {
          markers[c.id].setLatLng([c.lat, c.lng]);
        } else {
          const collIcon = L.divIcon({
            className: '',
            html: '<div class="collector-icon">🚛</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          markers[c.id] = L.marker([c.lat, c.lng], { icon: collIcon })
            .addTo(map)
            .bindPopup('<b>🚛 Collector Available</b><br>' + c.label);
        }
      });
      // Remove stale markers
      const ids = data.map(c => c.id);
      Object.keys(markers).forEach(id => {
        if (!ids.includes(id)) {
          map.removeLayer(markers[id]);
          delete markers[id];
        }
      });
    }

    // ── SURGE HEATMAP (For Collectors) ─────────────────────────────
    let surgeLayers = [];
    const SURGE_ZONES = [
      { name: 'Kasoa Market', lat: 5.5350, lng: -0.4250, intensity: 0.8 },
      { name: 'Old Barrier', lat: 5.5450, lng: -0.4150, intensity: 0.6 },
      { name: 'Galleria Area', lat: 5.5250, lng: -0.4350, intensity: 0.9 },
      { name: 'Bawjiase Rd', lat: 5.5380, lng: -0.4320, intensity: 0.5 }
    ];

    function updateHeatmap(show) {
      surgeLayers.forEach(layer => map.removeLayer(layer));
      surgeLayers = [];
      if (!show) return;

      SURGE_ZONES.forEach(zone => {
        const surge = L.circle([zone.lat, zone.lng], {
          radius: 600 * zone.intensity,
          color: '#EF4444',
          fillColor: '#EF4444',
          fillOpacity: 0.4 * zone.intensity,
          weight: 0
        }).addTo(map);
        surgeLayers.push(surge);
        
        // Add a small label
        const label = L.marker([zone.lat, zone.lng], {
          icon: L.divIcon({
            className: 'surge-label',
            html: '<div style="color: #EF4444; font-weight: 900; font-size: 10px; text-shadow: 0 0 2px white; white-space: nowrap;">⚡ SURGE '+ (zone.intensity * 2).toFixed(1) +'x</div>',
            iconAnchor: [30, 0]
          })
        }).addTo(map);
        surgeLayers.push(label);
      });
    }

    // ── RANGE CIRCLE (For Customers) ───────────────────────────────
    let rangeCircle = null;
    function updateRangeCircle(lat, lng) {
      if (rangeCircle) map.removeLayer(rangeCircle);
      rangeCircle = L.circle([lat, lng], {
        radius: ${COVERAGE_RADIUS_MILES * 1609.34},
        color: '#06C167',
        fillColor: '#06C167',
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '5, 10'
      }).addTo(map);
    }

    let userMarker = null;
    ${hasRealLocation ? `
    const userIcon = L.divIcon({
      className: '',
      html: '<div class="user-pulse-outer"><div class="user-pulse-inner"></div></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    userMarker = L.marker([${centerLat}, ${centerLng}], { icon: userIcon }).addTo(map);
    updateRangeCircle(${centerLat}, ${centerLng});
    ` : ''}

    window.updateUserLocation = (lat, lng, reDrawRoute) => {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        const userIcon = L.divIcon({
          className: '',
          html: '<div class="user-pulse-outer"><div class="user-pulse-inner"></div></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
      }
      
      updateRangeCircle(lat, lng);
      
      if (reDrawRoute && window.drawRealRoute) {
        window.drawRealRoute(lat, lng);
      } else {
        ${showRoute ? `map.panTo([lat, lng]);` : ''}
      }
    };

    // ── REAL ROUTING ────────────────────────────────────────────────
    let routeLine = null;
    let destMarker = null;

    window.drawRealRoute = async (startLat, startLng, dLat = ${destinationLatitude || 'null'}, dLng = ${destinationLongitude || 'null'}) => {
      if (!dLat || !dLng) return;
      try {
        const url = 'https://router.project-osrm.org/route/v1/driving/' + startLng + ',' + startLat + ';' + dLng + ',' + dLat + '?overview=full&geometries=geojson';
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes[0]) {
          if (routeLine) map.removeLayer(routeLine);
          if (destMarker) map.removeLayer(destMarker);

          const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          routeLine = L.polyline(coords, { 
            color: '#06C167', 
            weight: 6,
            opacity: 0.8,
            lineCap: 'round'
          }).addTo(map);
          
          // Destination Marker
          const destIcon = L.divIcon({
            className: 'dest-icon',
            html: '📍',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });
          destMarker = L.marker([dLat, dLng], { icon: destIcon }).addTo(map);
          
          // Only fit bounds on initial load, then just pan
          if (!window.initialBoundsFit) {
             map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
             window.initialBoundsFit = true;
          }
        }
      } catch (e) {
        console.error("Routing error:", e);
      }
    };

    window.updateDestinationLocation = (dLat, dLng) => {
      if (!dLat || !dLng) return;
      if (destMarker) {
        destMarker.setLatLng([dLat, dLng]);
      }
      if (userMarker) {
        window.drawRealRoute(userMarker.getLatLng().lat, userMarker.getLatLng().lng, dLat, dLng);
      }
    };

    if (${showRoute ? 'true' : 'false'}) {
      window.drawRealRoute(${centerLat}, ${centerLng});
    }

    // Initial load
    updateHeatmap(${showHeatmap ? 'true' : 'false'});
    window.updateCollectors(${collectorsJSON});

  </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'REGION_CHANGE' && onRegionChange) {
              onRegionChange({ latitude: data.lat, longitude: data.lng });
            }
          } catch (e) {}
        }}
      />
      {hasRealLocation && (
        <View style={styles.coverageBadge}>
          <View style={styles.coverageDot} />
          <Text style={styles.coverageText}>
            {collectors.length > 0
              ? `${collectors.length} collector${collectors.length > 1 ? 's' : ''} within 3 mi`
              : 'Checking for collectors...'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    flex: 1,
    backgroundColor: '#e8f0e9',
  },
  coverageBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  coverageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06C167',
    marginRight: 6,
  },
  coverageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
});
