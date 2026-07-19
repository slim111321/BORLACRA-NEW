import * as ExpoLocation from 'expo-location';
import { supabase } from '../lib/supabase';
import { checkAndNotifyMissedBookings } from './notifications';

export const COVERAGE_RADIUS_MILES = 3.0;
export const LOCATION_UPDATE_INTERVAL_MS = 15_000; // 15 seconds

export interface UserCoords {
  latitude: number;
  longitude: number;
}

export interface NearbyCollector {
  collector_id: string;
  latitude: number;
  longitude: number;
  distance_miles: number;
  updated_at: string;
}

/** Request foreground location permission. Returns true if granted. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Get user's current GPS coordinates. */
export async function getUserLocation(): Promise<UserCoords | null> {
  try {
    const { status } = await ExpoLocation.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const granted = await requestLocationPermission();
      if (!granted) return null;
    }
    const pos = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.High,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Push collector's current GPS location to Supabase.
 * Uses UPSERT so there is always just one row per collector.
 */
export async function updateCollectorLocation(
  collectorId: string,
  coords: UserCoords,
  isOnline: boolean,
): Promise<boolean> {
  const { error: upsertError } = await supabase.from('collector_locations').upsert(
    {
      collector_id: collectorId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      is_online: isOnline,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'collector_id' },
  );
  if (upsertError) {
    // This was previously unchecked — a silently-rejected write here (e.g.
    // RLS blocking an unverified collector) meant is_online/updated_at
    // never actually updated, with zero visibility into why.
    console.error('[Location] Failed to upsert collector_locations:', upsertError.message);
  }

  // If online, check if any customers are waiting nearby right now!
  if (isOnline) {
    try {
      const matched = await checkAndNotifyMissedBookings(collectorId, coords.latitude, coords.longitude);
      return matched;
    } catch (e) {
      console.error('Missed booking check failed:', e);
    }
  }
  return false;
}

/**
 * Query Supabase for online collectors within the coverage radius.
 * Returns an array sorted by distance (nearest first).
 */
export async function findNearbyCollectors(
  userLat: number,
  userLng: number,
  radiusMiles: number = COVERAGE_RADIUS_MILES,
): Promise<NearbyCollector[]> {
  const { data, error } = await supabase.rpc('find_collectors_within_miles', {
    user_lat: userLat,
    user_lng: userLng,
    radius_miles: radiusMiles,
  });

  if (error) {
    console.error('findNearbyCollectors error:', error.message);
    return [];
  }
  return (data as NearbyCollector[]) ?? [];
}

/** Format distance for display, e.g. "0.8 mi" or "2.4 mi" */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'very close';
  return `${miles.toFixed(1)} mi`;
}

/** True if the collector location was updated within the last 2 minutes (is fresh). */
export function isLocationFresh(updatedAt: string): boolean {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs < 2 * 60 * 1000;
}

/** Calculate distance between two points in miles using Haversine formula. */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
