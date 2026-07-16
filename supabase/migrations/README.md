# Migration tracking

Established as part of BC-015 (Stage 4 Consolidated Fix Plan). Before this,
the project had no `supabase/migrations/` directory and no `supabase/config.toml`
— the database schema was not version-controlled anywhere in this repository
(confirmed in Stage 1 of the Borla Car engineering audit).

## Current status

**The live project (`samasama`, ref `gmllzbdvmhygbedqgxgf`) is currently
PAUSED** (confirmed via `supabase link --project-ref gmllzbdvmhygbedqgxgf` →
`project is paused`). This means:

- No live schema/RLS-policy introspection could be performed as part of this
  fix (BC-015). `supabase db pull` / `supabase db dump` both require an active
  database connection.
- Nothing in this repository can currently be validated against the real,
  current state of the database.
- **The application cannot function in production while the project is
  paused**, independent of any code fix — this is itself a production
  blocker an admin needs to resolve from the Supabase dashboard
  (https://supabase.com/dashboard/project/gmllzbdvmhygbedqgxgf).

See `../SCHEMA_NOTES.md` for a best-effort schema/RLS picture reconstructed
from application source code (not a live export) — use it as a starting
point for review, not as a source of truth.

## Once the project is unpaused

1. Run `supabase link --project-ref gmllzbdvmhygbedqgxgf` to complete linking.
2. Run `supabase db pull` to generate a real baseline migration from the
   live schema. This becomes the true source of truth this directory has
   been missing.
3. Reconcile that baseline against `../SCHEMA_NOTES.md` — anywhere they
   disagree, the live pull wins, and `SCHEMA_NOTES.md` should be corrected
   or removed.
4. From that point forward, every schema/RLS change should be a new file in
   this directory (`supabase migration new <name>`), applied with
   `supabase db push` only after review — never edited directly in the
   dashboard without also capturing the change here, or this directory will
   drift out of sync again.

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
  This still has **not been applied to the live `samasama` project**, since
  it is paused — only local-fixture-tested. Re-run
  `scripts/verify/bc003-local-db-test.sql` after `supabase db push` against
  a staging/branch environment (with real `pickups`/`profiles` data) before
  trusting it in production, since the real tables may have constraints or
  triggers this local fixture didn't include.

  **Rollback**: `supabase/rollback/20260715120000_pickups_verified_collector_only_DOWN.sql`
  (kept outside this directory so it's never auto-applied as a forward
  migration). Also tested against the same local fixture: applied the
  forward migration, confirmed the trigger blocked an unverified-collector
  write, ran the rollback script, confirmed both the trigger and function
  were gone (`pg_trigger`/`pg_proc` empty), and confirmed the same
  previously-blocked write now succeeded — proving the rollback is
  complete, not partial.

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
