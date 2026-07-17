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
