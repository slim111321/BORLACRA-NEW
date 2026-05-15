import { supabase } from './supabase';

export const ActivityType = {
  PICKUP_CREATED: 'PICKUP_CREATED',
  PICKUP_ACCEPTED: 'PICKUP_ACCEPTED',
  PICKUP_COMPLETED: 'PICKUP_COMPLETED',
  PICKUP_CANCELLED: 'PICKUP_CANCELLED',
  REFUND_ISSUED: 'REFUND_ISSUED',
  COLLECTOR_STATUS_CHANGE: 'COLLECTOR_STATUS_CHANGE',
  EMERGENCY_REPORT: 'EMERGENCY_REPORT'
} as const;

export type ActivityType = typeof ActivityType[keyof typeof ActivityType];


export async function logPlatformActivity(
  type: ActivityType,
  description: string,
  metadata: Record<string, any> = {}
) {
  try {
    await supabase.from('platform_activity').insert({
      event_type: type,
      description,
      metadata
    });
  } catch (err) {
    console.warn('[Activity] Failed to log activity:', err);
  }
}
