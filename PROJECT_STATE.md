# PROJECT_STATE.md

Last updated: 2026-07-21. The full approved "fix now" list from the
production-readiness audit is complete — see below for what's left as
genuine manual follow-up (things this environment can't do or that need a
product decision).

## What this project is

**Borla** (repo/package name `samsanative`, also referred to as "SamSa") —
a waste/trash pickup app for Ghana (Kasoa area). Three pieces:
- **Mobile app** (`App.tsx`, root) — Expo/React Native, customer + collector
  roles in one app (`AppStep`/`UserRole` drive which UI renders).
- **`web-admin/`** — separate Vite/React admin console (KYC approval,
  payouts, broadcasts, live ops map, finance).
- **`supabase/`** — Postgres schema (migrations + functions), the real
  backend for both. Live project: `samasama`, ref `gmllzbdvmhygbedqgxgf`,
  linked via the `supabase` CLI in this environment.

There is no CLAUDE.md in this repo. `supabase/SCHEMA_NOTES.md` and
`supabase/migrations/README.md` are the other two documents worth reading
before touching the backend — they contain a detailed history of prior
security fixes (the "BC-NNN" series) with the same rigor this session
continued.

**Important asymmetry right now**: the live Supabase project (migrations,
edge functions, secrets) is already updated per this session's changes.
The corresponding code in this git working tree is **uncommitted** (see
`git status`). If this working tree were lost before committing, the live
DB schema would drift out of sync with what's tracked in git. Commit these
changes before doing anything else risky.

## Session context

User asked for a full production-readiness audit (security, error
handling, env/config, monitoring, testing, deployment), then approved a
prioritized "fix now" list to work through, with two hard rules: check in
before anything destructive (deletions, migrations), and report progress
after each major item rather than batching everything to the end.

## Completed this session

### #1 — Paystack live key wiring (done, committed to working tree)
`App.tsx` was hardcoded to always use `EXPO_PUBLIC_PAYSTACK_TEST_KEY`
(plus a committed literal test-key fallback) — **real payments were never
being charged in production**. Fixed: a module-level `PAYSTACK_PUBLIC_KEY`
constant (same `__DEV__` pattern as `lib/sentry.ts`) picks the live key in
release builds, test key otherwise. Both env vars already present in the
user's local `.env.local`.

### #2 — AI provider keys moved server-side (done, deployed to live project)
`EXPO_PUBLIC_NVIDIA_API_KEY`/`GROQ`/`ANTHROPIC`/`GEMINI` used to ship
inside the compiled app. Now:
- `supabase/functions/ai-trash-estimate/` — Groq → NVIDIA → Claude
  fallback chain, server-side. Requires a real signed-in user (validates
  the caller's JWT via `auth.getUser()`, not just the public anon key).
- `supabase/functions/voice-transcribe/` — same pattern for Gemini.
- `supabase/migrations/20260721000000_ai_proxy_rate_limit.sql` —
  `ai_proxy_requests` table + `check_and_log_ai_proxy_request()` RPC,
  40/day per-user quota, advisory-locked against concurrent-request races.
  **Applied live.**
- Secrets `NVIDIA_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` set on the
  live project (`ANTHROPIC_API_KEY` left unset — wasn't set locally
  either; Claude still fails fast and stays in the chain for later).
- `utils/aiEstimator.ts` / `lib/voiceTranscription.ts` rewritten to call
  the proxy via `supabase.functions.invoke(...)`; both keep the same
  "fall back to a smart-mock estimate on any failure" behavior.
- Bonus: `lib/voiceTranscription.ts` used to import `@google/generative-ai`,
  which was never actually installed (not in `package.json`/`node_modules`)
  — voice transcription was silently broken before this fix, now works.
- Smoke-tested live: no auth → 401; anon key (not a real session) → 401;
  confirmed the anon key alone (extractable, same as before) is no longer
  sufficient to invoke a provider.

### #3 — Tests added (done)
- `scripts/verify/check-ai-estimator.js` rewritten to test the new
  proxy-calling client wrapper (was testing the old direct-provider-call
  logic, which no longer exists in that file).
- `scripts/verify/critical-rls-local-db-test.sql` — 20 assertions against
  a **real** local Postgres loaded from an actual `supabase db dump` of
  the live project (not a hand-reconstructed guess). Covers: profiles
  self-escalation blocking, payout_requests policy split, pickups claim
  policy (verified/unverified collector, already-assigned pickup), and the
  full payment-verification trigger chain (cash vs. unpaid-paystack vs.
  paid-paystack completion, customer payment_method vs. payment_status
  restriction, unrelated-user isolation).
- Not independently tested: the AI proxy edge functions' own internal
  provider-fallback logic (Groq→NVIDIA→Claude ordering) — it's a direct
  port of the previously-tested client logic, but wasn't re-verified
  end-to-end in Deno (no live invocation was made against a real provider,
  to avoid spending quota). Flagged as a known gap, not exhaustively closed.

### #6 — RLS re-verification (done — and this is the important one)
Pulled the real live schema (`supabase db dump --schema public`, read-only)
to check `profiles`/`payout_requests`/`landfills`/`broadcasts`/
`system_settings`. Found two live, currently-exploitable holes (worse than
the original audit's guesses, which had flagged this as "unconfirmed"):

1. **Critical — profiles self-escalation**: `profiles_update_own` +
   `profiles_update_v2` let any authenticated user update their own row
   with zero column restriction, no trigger existed at all. Any user could
   `PATCH` their own profile via the REST API and set `role='ADMIN'`,
   `is_verified=true`, or `wallet_balance` to anything.
2. **Medium — payout_requests self-approval**: one ALL-commands policy
   (`payout_requests_manage_verified`) meant a verified collector could
   directly `UPDATE` their own request's `status` to `'PAID'`, bypassing
   the admin-only `process_payout()` RPC (no direct money movement since
   nothing triggers off that table, but real record-tampering exposure).

**Fixed and applied live**: `supabase/migrations/20260721010000_profiles_and_payout_self_service_hardening.sql`
— a blocklist trigger on `profiles` (blocks self-editing
`role`/`is_verified`/`wallet_balance`/`onboarding_completed`/`status`/
`borla_points`/`loyalty_points`; everything else stays self-editable), and
`payout_requests` split into four command-scoped policies matching real
app usage (collectors INSERT only, admins UPDATE/DELETE).

`landfills`, `broadcasts`, `system_settings` were confirmed **already
correctly** admin-gated at the RLS level — no changes needed.

### #15 — profiles read-exposure fix (done, applied live)
Follow-up to #6: `profiles` was also fully world-readable — two SELECT
policies were bare `USING(true)` with no `TO` restriction, so anyone
holding just the public anon key (no login needed) could read every user's
phone number, live GPS, wallet balance, and KYC document URLs
(`vehicle_details.kyc_docs`/`photo_url`).

Traced every cross-user `profiles` read across `App.tsx` and
`web-admin/src/App.tsx` (~12 call sites in `App.tsx`; web-admin needed no
changes since it always runs as a real `ADMIN` session, already covered by
`is_admin()`). Fixed via
`supabase/migrations/20260721020000_profiles_read_exposure_fix.sql`:
dropped both loose policies (only self-or-admin remains on the base
table); added a `profiles_public` view exposing just `id, full_name,
phone_number, avatar_url, role, loyalty_points, vehicle_type,
vehicle_number, vehicle_details (kyc_docs/photo_url stripped),
push_token`, granted to `authenticated` only. Redirected all ~12
`App.tsx` cross-user read call sites from `.from('profiles')` to
`.from('profiles_public')`; left the two PostgREST FK-embed sites
(`profiles!customer_id(...)` etc.) untouched since the app's existing
per-row fallback logic now naturally uses the view when the embed nulls
out. `push_token` stays in the view *temporarily*, only until #10 (below)
moves push-sending server-side — removing it now would break real
notification delivery.

Also noted, not fixed (pre-existing, unrelated): several `App.tsx` call
sites reference `profiles.rating_average`, which is not a real column on
the live table — confirmed via the schema dump, not introduced by this
session's changes.

Tested against the real schema locally — 6 new assertions
(`scripts/verify/critical-profiles-read-exposure-local-db-test.sql`) plus
a full re-run of the earlier 20-assertion suite to confirm no regression.
**Applied to the live `samasama` project** via `supabase db push`.

### #4 — Sentry instrumentation (done)
`Sentry.init` was running (auto crash capture only) but zero manual
`Sentry.captureException` calls existed in either app. Wrote a script to
find every `catch (...) {` block, insert `Sentry.captureException(<the
actual caught variable>)` as the first statement, and pick severity from
whether the block used `console.error` (default/error level) vs.
`console.warn`-only (`{ level: 'warning' }`) — matching the severity
judgment already implicit in the existing logging. Previewed the full list
before applying (some catch blocks had *zero* logging, just a bare
`Alert.alert(...)` — completely invisible to monitoring before this).
- `App.tsx`: 41 catch blocks instrumented, `import * as Sentry from
  '@sentry/react-native'` added.
- `web-admin/src/App.tsx`: 26 catch blocks instrumented, `import * as
  Sentry from '@sentry/react'` added.
- Verified: `check-syntax` + full `tsc --noEmit` on both projects (zero new
  errors) + the entire `scripts/verify/*` suite, all still pass.

### #5 — React ErrorBoundary (done)
No error boundary existed anywhere in the mobile app — a render-time crash
in any single screen took the whole app down to a blank/native red-box
screen with no recovery short of force-quitting. Added
`components/ErrorFallback.tsx` (a simple "Something went wrong / Try
Again" screen) and wrapped `App` in `Sentry.ErrorBoundary` inside the entry
point, which both reports the error to Sentry automatically and renders
the fallback. This required renaming `index.ts` → `index.tsx` (JSX isn't
valid in a plain `.ts` file) and updating `package.json`'s `"main"` field
to match — confirmed no other file referenced the old `index.ts` path.
`tsc --noEmit` shows zero new errors on either new/changed file.

### #7 — GitHub Actions CI (done)
`.github/workflows/ci.yml`, two jobs, on push to `master` and every PR:
- **mobile**: all six `scripts/verify/*` checks, `npm run lint`, `npx tsc
  --noEmit -p tsconfig.json`.
- **web-admin**: `npm run lint` (non-blocking, see below), `npm run build`
  (`tsc -b && vite build`, blocking).

Two real pre-existing gaps found and fixed/handled while making this an
honest, actually-green gate rather than a fake one:
- Root `tsconfig.json` had no `include`/`exclude` at all, so `tsc --noEmit`
  was pulling in `web-arch/` (orphaned prototype), `scratch/`, and
  `supabase/functions/` (Deno, not Node/browser TS) — none of which belong
  to this project. Scoped it to the actual mobile app's own files
  (`App.tsx`, `index.tsx`, `components/`, `utils/`, `services/`, `lib/`,
  `constants.ts`, `types.ts`) and excluded `web-admin` (has its own
  tsconfig), `web-arch`, `scratch`, `supabase/functions`. With that scoping
  in place, only 4 real, tiny, pre-existing errors remained (`setActivePickup(prev
  => ...)` missing a type annotation) — fixed those directly (`: any`,
  matching this codebase's existing convention) rather than leave the gate
  red from day one.
- `web-admin`'s `npm run lint` reports 91 real pre-existing errors (mostly
  `@typescript-eslint/no-explicit-any`, plus a few React Compiler rule
  violations that look like genuine bugs worth a dedicated look later —
  see the comment in `ci.yml`). Fixing 91 lint errors is its own separate
  task, not something to silently absorb into "add CI" — and silently
  loosening the eslint config to force a false-green would hide real
  signal. Left lint as `continue-on-error: true` (still runs, still
  visible in the Actions log) and made the real build (`tsc -b && vite
  build`, which passes cleanly) the actual blocking gate for that job.

Not included (see the comment at the top of `ci.yml` for the full
reasoning): the two real-schema RLS regression suites
(`scripts/verify/critical-rls-local-db-test.sql` and
`critical-profiles-read-exposure-local-db-test.sql`) added this session.
They need the live project's full schema loaded into a local Postgres
first, and this repo's own migrations can't bootstrap a database from
scratch (see lesson #2 above) — giving CI direct production DB credentials
just to dump a schema on every run isn't worth the risk for this pass.
Revisit once a committed "base schema" migration exists. Until then, run
those two manually (same as this session did) before/after any RLS or
trigger change.

Every step verified locally before considering this done, not just
assumed from reading the YAML: all six mobile verify scripts, mobile
lint (0 errors) and typecheck (0 errors after the tsconfig fix), web-admin
lint (91 pre-existing errors, confirmed non-blocking is the right call)
and build (clean).

### #8 — Supabase call error-handling consistency (done)
The original audit's "110 calls, 41 try, 26 checks" was a rough estimate.
Built a precise scanner (finds every `{data, error} = await supabase...`
destructure and every bare unchecked `await supabase....` call, then checks
whether the error variable is actually referenced afterward) — the real,
precise gap was **21 call sites** genuinely never checking their error.
Fixed all of them individually (not a mechanical find-replace — each got
real judgment on Alert vs. silent-log):
- Several were masking a **real error as "not found"** — e.g. checking a
  user's existing support ticket or profile, where an unchecked fetch
  error fell through into "must not exist yet, create a new one" instead
  of surfacing the real problem. Fixed by explicitly distinguishing "no
  rows" (`PGRST116`, expected) from a genuine error (now re-thrown).
- Several were **optimistic-UI bugs**: local state (`setUserProfile`,
  `setDocuments`, a "✓ Uploaded" checkmark, a "Subscribed!" alert) was set
  *before* confirming the write actually succeeded, so a silent DB failure
  left the UI showing something that never actually happened. Reordered so
  local state only updates after the write is confirmed.
- The KYC document-upload flow (three chained writes: `collector_documents`
  upsert + `profiles.vehicle_details.kyc_docs`) had **zero** error handling
  on any of the three — a collector could upload a document, see it marked
  "Uploaded," and have it silently never reach the admin approval queue.
  Wrapped in a try/catch with a clear "won't be reviewed until it saves
  successfully" message.
- A couple of secondary/best-effort writes (auto-joining a pool creator as
  a member, incrementing a pool's member count) got Sentry visibility but
  deliberately *not* a blocking `Alert.alert` — the primary action already
  succeeded, interrupting the user over a secondary write failing would be
  worse UX than just monitoring it.
- Left alone, confirmed still out of scope: the `profiles.rating_average`
  write from #15/#6's write-up — targets a column that doesn't exist on
  the live table at all; adding error handling to a call that will always
  fail doesn't fix anything, the real fix is a schema/design decision this
  session didn't make.

Verified: full `scripts/verify/*` suite + `tsc --noEmit` clean after every
edit, not just at the end.

### #10 — Server-side push notifications (done, deployed to live project)
`utils/notifications.ts`'s `sendPushNotification` used to post directly to
Expo's push API from the client, given another user's raw push token read
out of `profiles_public` (which had `push_token` in it as a deliberate
*temporary* measure from #15, explicitly pending this fix). Anyone holding
another user's token could send them arbitrary notification content.

While reviewing this, found that `utils/notifications.ts`'s
`checkAndNotifyMissedBookings` was **already silently broken** by #15's
RLS tightening — it read a *different* user's `push_token` directly from
the base `profiles` table (not `profiles_public`), a file #15's App.tsx
sweep never touched. Fixed as part of this same change.

- New `supabase/functions/send-push-notification/index.ts`: takes a
  recipient **user id**, not a token — resolves the token itself
  server-side (service-role), so no client ever sees any push token again.
  Requires a real signed-in user (JWT validated) and a 200/day quota,
  reusing the same `check_and_log_ai_proxy_request()` RPC the AI proxy
  functions use (extended its `endpoint` check constraint to accept
  `'push_notification'`).
- `supabase/migrations/20260721030000_push_notification_server_side.sql`:
  the constraint extension, plus dropped `push_token` from
  `profiles_public` entirely (needed a real `DROP VIEW` + `CREATE VIEW` +
  re-`GRANT`, not `CREATE OR REPLACE VIEW` — Postgres won't let you drop a
  column that way). **Applied live.**
- `utils/notifications.ts` and all 5 call sites across `App.tsx` +
  `checkAndNotifyMissedBookings` updated to pass a user id instead of a
  token.
- Tested locally against the real schema (view confirmed missing
  `push_token`, quota RPC confirmed accepting the new endpoint value) plus
  a full re-run of both earlier test suites (20 + 7 assertions, no
  regression). Smoke-tested live: no auth → 401, anon key alone → 401.

### #14 — dispatch_scheduled_pickups() cron wiring (CONFIRMED RESOLVED — no action needed)
My first pass (`supabase db dump --schema cron` came back empty) concluded
`pg_cron` probably wasn't even enabled. That was wrong, and the method was
the problem: `pg_dump` structurally skips extension-owned schema content
by design (confirmed by re-testing `--data-only --schema cron` — also
empty despite `pg_cron` being enabled), not because nothing was there.

User confirmed `pg_cron` is enabled and ran the real query directly in the
Supabase SQL Editor. Result: `dispatch_scheduled_pickups()` **is** already
scheduled — `jobid 2`, `jobname "daily_scheduled_pickups"`, runs daily at
4am UTC, `active = true`. Subscriptions do auto-renew. No fix needed.

Side note on method: attempted a temporary edge function with a direct
Postgres connection (`SUPABASE_DB_URL`) to query `cron.job` server-side,
since PostgREST doesn't expose the `cron` schema and pg_dump can't see it
either. Blocked on not having the service-role key value available
locally to gate it, and the user (rightly) didn't want a new secret set on
the live project just for a one-off diagnostic. Deleted the function
without ever successfully calling it; the user ran the SQL directly
instead, which was both simpler and required no infrastructure changes at
all. **Lesson for next time a live-DB-only answer is needed and the
schema-dump approach comes back suspiciously empty: ask the user to run
the query directly before reaching for a temporary function/secret** — it's
lower-footprint and skips the auth problem entirely.

### #11 — `web-arch/` deleted (done)
Confirmed dead per the repo's own `DEPENDENCY_NOTES.md`; user approved
deletion. `git rm -r web-arch/` (17 tracked files) + removed the leftover
untracked `node_modules` from disk. Removed the now-pointless `web-arch`
entry from `tsconfig.json`'s exclude list. `tsc`/syntax checks still clean.

### #12 — `components/CreditCardForm.tsx` — CORRECTED, not deleted
**The original audit finding was wrong.** It said "never imported in
App.tsx" — true, but incomplete: `components/SubscriptionsScreen.tsx`
imports and renders `CreditCardForm`, and `SubscriptionsScreen` itself
*is* reachable in the real app (`AppStep.SUBSCRIPTIONS`, wired to real
"Scheduled Pickups"/"Subscriptions" menu items). Caught this by grepping
the whole repo instead of just `App.tsx` right before deleting — did not
delete it. Whether `SubscriptionsScreen`'s card-entry flow actually
charges anything real (vs. `CreditCardForm` just collecting display data
locally, same pattern noted for the file when it looked unused) wasn't
re-investigated — a separate question from "is this file dead code",
which it isn't.

### #13 — Firebase API key restrictions (flagged, needs manual user check)
No Google Cloud console access from this environment. User needs to
verify directly: Google Cloud Console → APIs & Services → Credentials →
find the key matching `google-services.json`'s `current_key`
(`AIzaSyDp...`) → confirm it's restricted by Android package name +
SHA-1 fingerprint (`com.samsa.borla`), not unrestricted.

### #9 — Gemini env doc (done, superseded by #2)
Originally "add the missing env var to `.env.local.example`" — instead,
the key moved server-side entirely (see #2), so `.env.local.example` now
documents the edge-function-secret pattern instead of a client env var.

## Key lessons learned this session (read before touching RLS/triggers again)

1. **`SECURITY DEFINER` on a trigger function defeats `current_user`
   checks.** The profiles trigger needs to distinguish "a real client
   request" from "an internal write from a trusted `SECURITY DEFINER`
   function" (specifically: `credit_collector_wallet`, called via
   `handle_pickup_completion` when a collector completes their own job,
   which touches that same collector's own `profiles` row). The
   distinguishing signal is `current_user <> 'postgres'` (every trusted
   `SECURITY DEFINER` function in this schema is owned by `postgres`). If
   the *checking* trigger function is itself marked `SECURITY DEFINER`,
   `current_user` reads as `postgres` unconditionally inside it regardless
   of the real caller — silently turning the whole check into a no-op.
   This was caught live via testing (every job completion started failing
   with "You cannot change your own wallet balance"), not by review.
   **Lesson: don't copy `SECURITY DEFINER` onto a new trigger function
   just because every other function in the file has it — check whether
   the new function actually needs elevated privileges, and whether it
   needs to observe the real caller's identity.**

2. **This repo's migrations cannot bootstrap a database from scratch.**
   The base `CREATE TABLE` statements for `profiles`/`pickups`/etc. predate
   migration tracking (BC-015) and only exist live — `supabase/migrations/`
   only has *incremental* changes. `supabase db start` replaying migrations
   from empty fails immediately (`relation "public.pickups" does not
   exist`). To test locally: temporarily move `supabase/migrations` aside,
   `supabase db start` (empty), load a real `supabase db dump --schema
   public` output directly via `docker exec -i supabase_db_SamSa psql ...`,
   *then* apply the new migration(s) on top, then restore the migrations
   directory. This is a real gap in the repo, not just a session
   inconvenience — worth fixing properly at some point (a committed "base
   schema" migration), but out of scope for this session.

3. **Test harness bug**: plain `RAISE EXCEPTION` in plpgsql defaults to
   SQLSTATE `P0001` — the exact code this codebase's triggers already use
   for intentional business-rule violations. A test's own synthetic
   "operation unexpectedly succeeded" raise must use a **different**
   SQLSTATE (used `P0002` this session) and the exception handler must
   explicitly re-raise on that code, or a test can silently report PASS
   when the real behavior actually failed. Caught by literally reading the
   caught error message during a supposedly-passing run, not by the exit
   code.

4. **Docker Desktop was installed but not running** in this environment;
   `open -a Docker` + polling `docker info` brought it up in ~10s. Worth
   trying this early in any session that needs real Postgres/RLS testing
   rather than assuming it's unavailable.

5. Paystack's `pk_live_.../pk_test_...` "public key" is meant to be
   client-embedded by design (unlike Stripe/others' secret keys) — not a
   secret, safe to reference directly. `EXPO_PUBLIC_*` vars in general are
   NOT safe for real secrets (NVIDIA/Groq/Anthropic/Gemini keys) — they
   ship in the compiled app bundle, extractable.

## The "fix now" list is complete. What's left is genuine manual follow-up:

- **#13 — Firebase API key restrictions**: verify manually in Google Cloud
  Console (no access from this environment) — see the #13 write-up above
  for exactly what to check. The only item left needing the user's own
  hands.
- ~~#14 — pg_cron~~ **CONFIRMED RESOLVED** — see write-up above. Already
  scheduled correctly, no action needed.
- **Two large items intentionally not started**, both flagged during the
  session as too large for their originating task's scope:
  - Task #6/#15's own follow-up: `profiles` row-level write/claim-policy
    protections are solid now, but genuinely fine-grained, per-audience
    column visibility (e.g. should a customer see a collector's phone
    number but not vice versa) was never fully designed — `profiles_public`
    is a reasonable single tier for "anyone authenticated," not a full
    audience matrix.
  - This repo's migrations still can't bootstrap a database from scratch
    (lesson #2 above) — a committed "base schema" migration would unlock
    running the RLS regression suites in CI (see #7's write-up).

## Explicitly out of scope (user said leave alone)

- USSD webhook auth (`supabase/functions/ussd-webhook`) — no signature
  verification, anyone can POST fake pickups. Left alone per instruction.
- WhatsApp webhook signature verification
  (`supabase/functions/whatsapp-webhook`) — POST handler doesn't verify
  Meta's `X-Hub-Signature-256`. Left alone per instruction.
- Broken "Call Us" support button (`tel:+233XXXXXXXXX` literal placeholder,
  `App.tsx` ~6767). Left alone per instruction.
- Apple Developer account / App Store submission / APNs — user doesn't
  have the account set up yet.
- Upgrading any API/billing tier — stay on free/trial tiers throughout.

## Reference

- Live Supabase project: `samasama`, ref `gmllzbdvmhygbedqgxgf`, linked via
  `supabase` CLI (already authenticated in this environment).
- Full original audit categories (security/error-handling/env/monitoring/
  testing/deployment/cost) are in the conversation history that produced
  this fix list — not re-copied here since the fix-now list above is the
  actionable subset.
- `supabase/SCHEMA_NOTES.md` and `supabase/migrations/README.md` — prior
  security-fix history (the "BC-NNN" series), same rigor this session
  continued. Read before making further RLS/trigger changes.
