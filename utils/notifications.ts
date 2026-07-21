import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';

// Behavior when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permissions and get the Expo Push Token for remote notifications.
 * @returns The Expo Push Token string or null if denied/failed.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#06C167',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    // projectId is automatically sourced from app.json / app.config.js EAS config
    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } catch (e) {
      console.error('Error fetching Expo Push Token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

/**
 * Save the push token securely to the user's profile in Supabase.
 */
export async function savePushTokenAsync(userId: string, token: string) {
  if (!token) return;
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
    
  if (error) {
    console.error('Failed to save push token to DB:', error);
  }
}

/**
 * Schedule a Local Notification for X days in the future to remind them to take out the trash.
 * @param daysFromNow Number of days from now to schedule the alert.
 */
export async function schedulePredictiveReminder(daysFromNow: number = 4) {
  // First, cancel any previously scheduled trash reminders to prevent spam
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule new one
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🗑️ Time for a Pickup?',
      body: `It's been a few days since your last pickup. Tap here to schedule a collector and keep your space clean!`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: daysFromNow * 24 * 60 * 60, // Convert days to seconds
      repeats: false,
    },
  });
}

/**
 * Send a push notification to a user via the `send-push-notification` edge
 * function, given their user id -- not their raw Expo push token. Sending
 * (and resolving the recipient's token) happens entirely server-side now;
 * the client never reads or transmits another user's push token, so a
 * client can no longer send arbitrary notification content to anyone
 * whose token it happens to have.
 * @param recipientUserId The recipient's profiles.id
 * @param title Notification Title
 * @param body Notification Body
 * @param data Optional extra payload data
 */
export async function sendPushNotification(recipientUserId: string, title: string, body: string, data?: Record<string, unknown>) {
  const { error } = await supabase.functions.invoke('send-push-notification', {
    body: { recipientUserId, title, body, data },
  });
  if (error) {
    console.error('[Push] Failed to send notification:', error);
  }
}

/**
 * Edge logic: When a collector goes online or updates their location,
 * check if there are any recent (last 4 hours) unresolved missed bookings within 3 miles.
 * If so, notify the customer via push notification that a collector is now available.
 */
export async function checkAndNotifyMissedBookings(collectorId: string, collectorLat: number, collectorLng: number): Promise<boolean> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  
  // Fetch unresolved missed bookings from the last 4 hours
  // We don't join profiles here to be more robust against missing foreign key relations
  const { data: bookings, error } = await supabase
    .from('missed_bookings')
    .select('*')
    .eq('resolved', false)
    .gte('created_at', fourHoursAgo);

  if (error || !bookings || bookings.length === 0) return false;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  
  let matchFound = false;

  for (const booking of bookings) {
    const dLat = toRad(booking.latitude - collectorLat);
    const dLng = toRad(booking.longitude - collectorLng);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(collectorLat)) * Math.cos(toRad(booking.latitude)) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    const distanceMiles = R * c;

    // Radius is 3 miles
    if (distanceMiles <= 3.0) {
      matchFound = true;
      
      // 1. Mark as resolved so we don't spam them again
      const { error: resolveError } = await supabase.from('missed_bookings').update({
        resolved: true,
        resolved_by: collectorId
      }).eq('id', booking.id);
      if (resolveError) {
        console.error('[MissedBookings] Failed to mark resolved:', resolveError);
      }

      // 2. Notify the customer -- the edge function resolves their push
      // token itself server-side, we only ever pass their user id.
      await sendPushNotification(
        booking.user_id,
        '🚛 Good news!',
        'A collector is now in your area. Tap to open the app and schedule your pickup before they leave!'
      );
    }
  }

  return matchFound;
}
