#!/usr/bin/env node
/**
 * Regression guard for BC-011 (App.tsx called savePushTokenAsync() without
 * importing it — a ReferenceError inside an unhandled promise chain, so
 * every push token silently failed to save and no push notification could
 * ever be delivered).
 *
 * Confirms every symbol App.tsx calls from utils/notifications.ts is
 * actually present in the import statement pulling from that module.
 *
 * Usage: node scripts/verify/check-push-token-wired.js
 */
const fs = require('fs');
const path = require('path');

const APP_TSX = path.join(__dirname, '..', '..', 'App.tsx');
const source = fs.readFileSync(APP_TSX, 'utf8');

const importMatch = source.match(/import\s*{([^}]+)}\s*from\s*['"]\.\/utils\/notifications['"]/);
if (!importMatch) {
  console.error("[check-push-token-wired] FAIL: could not find the './utils/notifications' import in App.tsx — has it moved/changed?");
  process.exit(1);
}
const imported = importMatch[1].split(',').map((s) => s.trim()).filter(Boolean);

// Every exported symbol from utils/notifications.ts that App.tsx actually calls.
const NOTIFICATIONS_EXPORTS = [
  'registerForPushNotificationsAsync',
  'savePushTokenAsync',
  'sendPushNotification',
  'schedulePredictiveReminder',
  'checkAndNotifyMissedBookings',
];

let hasError = false;
for (const fn of NOTIFICATIONS_EXPORTS) {
  const isCalled = new RegExp(`\\b${fn}\\s*\\(`).test(source.replace(importMatch[0], ''));
  const isImported = imported.includes(fn);
  if (isCalled && !isImported) {
    hasError = true;
    console.error(`[check-push-token-wired] FAIL: App.tsx calls ${fn}() but does not import it from './utils/notifications'`);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('[check-push-token-wired] PASS: every utils/notifications function App.tsx calls is properly imported');
  process.exit(0);
}
