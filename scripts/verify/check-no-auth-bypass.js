#!/usr/bin/env node
/**
 * Regression guard added for BC-002 (a "Demo / Quick Login (Skip Auth)" control
 * on the production LOGIN screen let any user reach AppStep.HOME or
 * AppStep.COLLECTOR_DASHBOARD with zero Supabase auth call).
 *
 * This does not try to fully parse React/JSX control flow — it makes two
 * narrow, high-signal assertions against the LOGIN screen's source block:
 *   1. The literal "Skip Auth" string (the bypass control's own label) is gone.
 *   2. The LOGIN case does not directly call setStep(AppStep.HOME) or
 *      setStep(AppStep.COLLECTOR_DASHBOARD) — the two authenticated landing
 *      screens a bypass would jump to. Legitimate navigation to those screens
 *      happens from navigateByRole()/handleEmailAuth()/OTP verification,
 *      none of which live inside the LOGIN screen's JSX block.
 *
 * Usage: node scripts/verify/check-no-auth-bypass.js
 */
const fs = require('fs');
const path = require('path');

const APP_TSX = path.join(__dirname, '..', '..', 'App.tsx');
const source = fs.readFileSync(APP_TSX, 'utf8');

let hasError = false;

if (/skip\s*auth/i.test(source)) {
  hasError = true;
  console.error('[check-no-auth-bypass] FAIL: "Skip Auth" text still present in App.tsx');
}

const loginStart = source.indexOf('case AppStep.LOGIN:');
const otpStart = source.indexOf('case AppStep.OTP:');

if (loginStart === -1 || otpStart === -1 || otpStart <= loginStart) {
  hasError = true;
  console.error('[check-no-auth-bypass] FAIL: could not locate the LOGIN screen block (case AppStep.LOGIN: ... case AppStep.OTP:) — screen structure may have changed, please review this check');
} else {
  const loginBlock = source.slice(loginStart, otpStart);

  const forbiddenPatterns = [
    /setStep\(\s*AppStep\.HOME\s*\)/,
    /setStep\(\s*AppStep\.COLLECTOR_DASHBOARD\s*\)/,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(loginBlock)) {
      hasError = true;
      console.error(`[check-no-auth-bypass] FAIL: LOGIN screen block directly navigates to an authenticated screen without going through auth (${pattern})`);
    }
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('[check-no-auth-bypass] PASS: no unauthenticated bypass found in the LOGIN screen');
  process.exit(0);
}
