# Migration tracking

Established as part of BC-015 (Stage 4 Consolidated Fix Plan). Before this,
the project had no `supabase/migrations/` directory and no `supabase/config.toml`
— the database schema was not version-controlled anywhere in this repository
(confirmed in Stage 1 of the Borla Car engineering audit).

## Current status

The live project (`samasama`, ref `gmllzbdvmhygbedqgxgf`) was paused earlier
in this project's history but is reachable again. All migrations in this
directory have been applied to it via `supabase db push` (confirmed via
`supabase migration list` showing every timestamp present under Remote, and
via live queries against the real tables/functions afterward — see each
migration's entry below).

See `../SCHEMA_NOTES.md` for schema/RLS notes gathered from a real
`supabase db dump` against the live project.

## Applying new migrations going forward

1. `supabase migration new <name>` to create a new timestamped file here.
2. Write the forward migration and a paired rollback in `../rollback/`.
3. Validate locally first (`supabase start` + a temporary fixture migration
   mirroring the real columns/policies involved — see the two migrations
   below for the established pattern), then `supabase db push` to apply to
   the live project — never edit the dashboard directly without also
   capturing the change here, or this directory drifts out of sync again.

## Migrations in this directory so far

- `20260715120000_pickups_verified_collector_only.sql` — part of BC-003
  (server-side enforcement that only a verified collector can be assigned to
  a pending pickup, atomically, closing the same race condition tracked as
  BC-007 since both live on the exact same write). Written from code-level
  evidence of the `pickups`/`profiles` columns it touches, not from a live
  schema pull.

  **Validated against a real local Postgres** (`supabase db start`, Docker) —
  not just reviewed statically — using a temporary, minimal `profiles`/
  `pickups` fixture (created and torn down for this test only, never
  committed) with `scripts/verify/bc003-local-db-test.sql`. All 5 cases
  passed: verified collector accepts ✅, unverified collector rejected ✅,
  non-collector role rejected ✅, second-collector race on an
  already-assigned job rejected with the original assignment preserved ✅,
  unrelated updates (e.g. marking a job collected) pass through untouched ✅.
  **Applied to the live `samasama` project** via `supabase db push`.

  **Rollback**: `supabase/rollback/20260715120000_pickups_verified_collector_only_DOWN.sql`
  (kept outside this directory so it's never auto-applied as a forward
  migration). Also tested against the same local fixture: applied the
  forward migration, confirmed the trigger blocked an unverified-collector
  write, ran the rollback script, confirmed both the trigger and function
  were gone (`pg_trigger`/`pg_proc` empty), and confirmed the same
  previously-blocked write now succeeded — proving the rollback is
  complete, not partial.

- `20260716060000_vehicle_dispatch_pricing.sql` — Choose Vehicle screen: adds
  `price_per_km` / `price_per_bag` / `active` to the real, already-live
  `trash_vehicles` table (seeded with placeholder starter rates — adjust as
  a real business decision), plus two new SECURITY DEFINER RPCs:
  `find_available_collectors_by_vehicle` (vehicle-type-aware nearest-collector
  search, modeled on the existing `find_nearby_collectors`) and
  `get_active_surge_multiplier` (reads `system_settings.surge_settings` +
  `surge_zones`, returns 1.0/no-op today since `auto_active` is currently
  `false`). Written and tested against a local Postgres fixture that
  replicates the real live `collector_locations`/`profiles`/`system_settings`/
  `surge_zones` columns confirmed via a real `supabase db dump`.
  **Applied to the live `samasama` project** via `supabase db push` and
  verified with real post-push queries: `trash_vehicles` returns the new
  columns with real data, `get_active_surge_multiplier` returns `1` (no
  surge, matching the real `system_settings.surge_settings.auto_active =
  false`).

  **Rollback**: `supabase/rollback/20260716060000_vehicle_dispatch_pricing_DOWN.sql`
  — drops both new functions and the three new columns; does not touch any
  pre-existing `trash_vehicles` row or column.

- `20260716120000_profile_preferred_payment_method.sql` — Payment Methods
  screen: adds a nullable `preferred_payment_method` column to `profiles` so
  the screen (previously fully decorative — no row had an `onPress`) can
  persist which method a customer selected as default. Deliberately narrow:
  no real MoMo/card processing is wired to this column, since payments stay
  out of scope for now. Tested locally as a real non-admin customer via
  RLS-enforced REST calls before pushing. **Applied to the live `samasama`
  project** via `supabase db push` and confirmed live-readable afterward.

- `20260717090000_loyalty_redemptions.sql` — Fuel Hub "Activate Voucher"
  (GOIL): adds a real redemption ledger (`collector_id`, `reward_type`,
  `points_spent`, `voucher_code`, `status`). Previously this button only
  showed a static Alert — no points were spent and nothing was recorded.
  RLS scoped to `collector_id = auth.uid()` for both select and insert.
  Tested locally as two separate real collectors via RLS-enforced REST
  calls (points deduction + redemption insert + confirmed per-collector
  isolation) before pushing. **Applied to the live `samasama` project** via
  `supabase db push` and confirmed live-readable afterward.

  **Rollback**: `supabase/rollback/20260717090000_loyalty_redemptions_DOWN.sql`
  — drops the table entirely.

  **Rollback**: `supabase/rollback/20260716120000_profile_preferred_payment_method_DOWN.sql`
  — drops the column; touches nothing else.

- `20260718000000_pickup_payment_verification.sql` — BC-018: closes the gap
  where a collector could tap "Complete Job & Get Paid" and be paid
  regardless of whether the customer's card/MoMo charge ever actually
  succeeded (handlePaymentSuccess only ever touched local React state, no DB
  write-back). Adds `pickups.payment_method` / `payment_status`, a new
  customer-owner UPDATE policy restricted by a trigger to only ever setting
  `payment_method` (never `payment_status`, never any other column), and
  extends the Paystack webhook (`supabase/functions/paystack-webhook`) to
  set `payment_status='paid'` on verified `pickup_payment` charges — the one
  write path a customer's own client can't forge, since it only runs after
  a real HMAC-verified Paystack event under the service-role key.
  `handleJobFinalize` (App.tsx) now re-fetches both columns live and refuses
  to finalize a paystack-method job until `payment_status='paid'`. Cash jobs
  are deliberately left ungated — no cryptographic way to verify cash
  changed hands, so the collector's own completion remains the trust point,
  same as before this migration. Tested against a local Postgres fixture
  (customer sets payment_method ✅, customer blocked from setting
  payment_status directly ✅, customer blocked from touching status/
  collector_id/pricing_ghs ✅, free to switch payment_method pre-payment ✅,
  locked after payment_status='paid' ✅, service-role webhook write
  unaffected by the customer restriction ✅) before being applied to the
  live `samasama` project via `supabase db push`, and the updated edge
  function deployed via `supabase functions deploy paystack-webhook`.

  **Rollback**: `supabase/rollback/20260718000000_pickup_payment_verification_DOWN.sql`
  — drops the trigger, function, policy, and both new columns.

- `20260718010000_pickups_tighten_claim_policy.sql` — BC-019: while testing
  BC-018 locally against the *real* pickups policies (pulled via a live
  `supabase db dump --schema public`, confirming the exact definitions
  SCHEMA_NOTES.md had only described), reproduced a real, live exploit: an
  authenticated user with no relationship to a pickup at all (not its
  customer, not its collector) could update that pickup's `payment_method`
  — and, separately, any authenticated user with `role='COLLECTOR'` could
  claim any pending pickup with **no `is_verified`/`onboarding_completed`
  check**, via two redundant, overly-loose UPDATE policies ("Collectors can
  claim and update pickups" and "pickups_update"). The BC-003 trigger
  already independently blocked the unverified-collector-*assignment* case,
  but the loose policies still undermined BC-018's payment gate. Could not
  simply drop both policies — the one correctly-scoped policy
  (`pickups_update_collector_ops`) only covers a pickup a collector is
  *already* assigned to, not the initial claim of a still-pending one, so
  dropping both would have broken the core "accept a job" flow entirely.
  Instead, consolidated the two into one policy using the same
  `is_verified_collector()`/`is_admin()` helpers the tight policy already
  uses. Tested against a local fixture mirroring the exact real enum,
  functions, and all five real pickups UPDATE/SELECT/INSERT policies:
  verified collector claims a pending pickup ✅, unverified collector
  blocked ✅, unrelated user blocked from touching someone else's pickup ✅
  (previously reproduced as succeeding, confirmed fixed), admin override
  still works ✅, customer's own BC-018 payment_method write unaffected ✅.
  **Applied to the live `samasama` project** via `supabase db push`,
  confirmed live via a post-push `supabase db dump` showing the loose
  policy gone and the tightened one in place.

  **Rollback**: `supabase/rollback/20260718010000_pickups_tighten_claim_policy_DOWN.sql`
  — restores the original two loose policies exactly as they were live.

- `20260718020000_security_definer_hardening.sql` — BC-020: found while
  verifying admin-table RLS (BC-018/BC-019 follow-up). Live schema dump
  revealed `process_payout(p_request_id)` — the RPC the admin console calls
  to pay out a collector's cash-out request — had **no authorization check
  at all** and was granted to `anon`: any caller, even fully
  unauthenticated, could call it directly and force any payout to
  'PAID' plus deduct the collector's wallet balance, with no idempotency
  guard (callable twice on the same request for a double deduction). Also
  found: `handle_pickup_completion()`, the actual trigger that pays a
  collector the moment `pickups.status` becomes `'completed'`, had no
  awareness of BC-018's new `payment_method`/`payment_status` columns —
  BC-018's client-side check in `handleJobFinalize` is only a UX guard;
  anyone hitting the REST API directly could still bypass it entirely. Both
  fixed at the true enforcement point (the functions themselves, not just
  client code). Also pinned `SET search_path = public` on every
  `SECURITY DEFINER` function found missing it
  (`credit_collector_wallet`, `dispatch_scheduled_pickups`,
  `find_nearby_collectors`, `is_verified_collector`, plus the two above) —
  a known Postgres privilege-escalation class, no behavioral change to
  their existing logic. Tested against a local Postgres fixture: non-admin
  blocked from `process_payout` ✅, unauthenticated `anon` blocked at the
  grant level ✅, real admin succeeds once ✅, calling it again on the same
  now-PAID request fails (no double-spend) ✅, unpaid paystack pickup
  blocked from completing ✅, cash pickup completes normally (unaffected,
  by design — no cryptographic way to verify cash) ✅, verified-paid
  paystack pickup completes and pays normally ✅. Applied to the live
  `samasama` project via `supabase db push`, confirmed live via a post-push
  `supabase db dump`: `anon` no longer in `process_payout`'s grants, all 12
  `SECURITY DEFINER` functions now show a pinned search_path.

  **Rollback**: `supabase/rollback/20260718020000_security_definer_hardening_DOWN.sql`
  — restores each function's exact original live body and grants.

## Migration standards (established here, as the first migration in this project)

Since this repository had no prior migrations to follow a convention from,
this one sets the pattern going forward:
- Filename: `<UTC timestamp>_<snake_case description>.sql`.
- Header comment explains: root cause / why this approach over alternatives
  / exact scope (which tables/columns it touches) / testing status.
- DDL is idempotent where possible (`create or replace function`,
  `drop trigger/function if exists`) so re-applying is safe.
- A paired rollback script lives in `../rollback/<same timestamp>_<name>_DOWN.sql`
  and is tested the same way the forward migration is.
