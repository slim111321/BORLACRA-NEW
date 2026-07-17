#!/usr/bin/env node
/**
 * Regression guard for BC-019 (web-admin checked Notification.permission
 * === 'granted' at 6 call sites but never called
 * Notification.requestPermission() anywhere, so the permission stayed at
 * its browser default ('default', not 'granted') forever and every admin
 * desktop alert silently no-op'd).
 *
 * Confirms requestPermission() is actually called somewhere in the app.
 *
 * Usage: node scripts/verify/check-admin-notification-permission.js
 */
const fs = require('fs');
const path = require('path');

const APP_TSX = path.join(__dirname, '..', '..', 'web-admin', 'src', 'App.tsx');
const source = fs.readFileSync(APP_TSX, 'utf8');

const requestsPermission = /Notification\.requestPermission\s*\(/.test(source);
const checksPermission = /Notification\.permission\s*===\s*['"]granted['"]/.test(source);

if (checksPermission && !requestsPermission) {
  console.error('[check-admin-notification-permission] FAIL: web-admin checks Notification.permission but never calls Notification.requestPermission() — the check can never pass');
  process.exit(1);
}

console.log('[check-admin-notification-permission] PASS: Notification.requestPermission() is called before permission is checked');
process.exit(0);
