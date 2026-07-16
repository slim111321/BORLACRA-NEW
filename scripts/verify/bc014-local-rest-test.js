#!/usr/bin/env node
/**
 * Local-only integration test for the BC-014 fix in
 * web-admin/src/App.tsx's fetchIncidents() — confirms the .or('type.neq.REVIEW,type.is.null')
 * filter excludes review-sourced incident_reports rows while still
 * surfacing real incidents AND rows with a null/unexpected `type` (so a
 * safety incident is never silently hidden by an unexpected data shape).
 *
 * Requires a running local Supabase stack with the minimal fixture tables
 * (profiles/pickups/incident_reports) and the 5 seeded rows described in
 * this repo's BC-014 implementation notes. Not wired into `npm run verify:*`
 * because it depends on `supabase start` (Docker) being up — run manually:
 *
 *   supabase start
 *   # re-create the temporary fixture + seed rows (see git history /
 *   # BC-014 write-up for the exact SQL), then:
 *   node scripts/verify/bc014-local-rest-test.js
 *   supabase stop --no-backup
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'; // well-known Supabase local-dev default anon key, not a secret

const EXPECTED = {
  included: ['ACCIDENT', 'SOS', null], // real incidents + null-type (must stay visible)
  excludedType: 'REVIEW',
};

async function main() {
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*, profiles(id, full_name, phone_number), pickups(trash_type, pickup_location_name)')
    .or('type.neq.REVIEW,type.is.null')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[bc014-test] FAIL: query error —', error.message);
    process.exit(1);
  }

  const types = data.map((r) => r.type);
  const hasReview = types.includes('REVIEW');
  const missingRealIncidents = EXPECTED.included.filter((t) => !types.includes(t));

  if (hasReview) {
    console.error('[bc014-test] FAIL: a REVIEW-type row leaked into the incident queue');
    process.exit(1);
  }
  if (missingRealIncidents.length > 0) {
    console.error('[bc014-test] FAIL: expected type(s) missing from results:', missingRealIncidents);
    process.exit(1);
  }

  console.log(`[bc014-test] PASS: ${data.length} row(s) returned, no REVIEW rows, real/null-type incidents preserved`);
  process.exit(0);
}

main();
