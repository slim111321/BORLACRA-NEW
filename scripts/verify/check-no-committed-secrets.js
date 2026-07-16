#!/usr/bin/env node
/**
 * Regression guard added for BC-038 (web-admin/.env was committed to git, and
 * lib/supabase.ts + six scratch/ scripts hardcoded the live Supabase anon key
 * as a string literal).
 *
 * Scans only git-TRACKED files (via `git ls-files`) for the leaked project's
 * Supabase host and the JWT header shared by every anon/service-role key, so
 * it flags a real re-leak without false-positiving on the legitimately
 * gitignored .env / .env.local files, which are expected to hold real values
 * locally and are never tracked.
 *
 * Usage: node scripts/verify/check-no-committed-secrets.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

const SECRET_PATTERNS = [
  { name: 'Supabase project host', pattern: /gmllzbdvmhygbedqgxgf\.supabase\.co/ },
  // Shared JWT header ("{"alg":"HS256","typ":"JWT"}" base64url-encoded) plus the
  // start of a Supabase-issued payload — matches any hardcoded Supabase JWT key,
  // not just the one already known to have leaked.
  { name: 'Supabase JWT key literal', pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI/ },
];

let trackedFiles;
try {
  trackedFiles = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch (e) {
  console.error('[check-no-committed-secrets] FAIL: could not list git-tracked files:', e.message);
  process.exit(1);
}

let hasError = false;

for (const relPath of trackedFiles) {
  const filePath = path.join(REPO_ROOT, relPath);
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    continue; // binary or unreadable file, skip
  }

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(contents)) {
      hasError = true;
      console.error(`[check-no-committed-secrets] FAIL: ${relPath} contains a hardcoded ${name}`);
    }
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`[check-no-committed-secrets] PASS: scanned ${trackedFiles.length} tracked files, no hardcoded Supabase secrets found`);
  process.exit(0);
}
