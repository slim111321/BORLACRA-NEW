import { supabase } from '../lib/supabase';

export enum ActivityType {
  PICKUP_CREATED = 'PICKUP_CREATED',
  PICKUP_ACCEPTED = 'PICKUP_ACCEPTED',
  PICKUP_COMPLETED = 'PICKUP_COMPLETED',
  PICKUP_CANCELLED = 'PICKUP_CANCELLED',
  REFUND_ISSUED = 'REFUND_ISSUED',
  COLLECTOR_STATUS_CHANGE = 'COLLECTOR_STATUS_CHANGE',
  EMERGENCY_REPORT = 'EMERGENCY_REPORT'
}

/**
 * Logs an event to the platform_activity table for the Admin Activity Feed.
 */
export async function logPlatformActivity(
  type: ActivityType,
  description: string,
  metadata: Record<string, any> = {}
) {
  try {
    const { error } = await supabase.from('platform_activity').insert({
      event_type: type,
      description,
      metadata
    });
    if (error) throw error;
  } catch (err) {
    console.warn('[Activity] Failed to log activity:', err);
    // Non-blocking, so we don't alert the user
  }
}
