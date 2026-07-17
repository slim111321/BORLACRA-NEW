# Code-inferred schema & RLS risk notes (BC-015)

## UPDATE (project now unpaused — confirmed against the real live schema)

The `samasama` project is reachable again as of this update. A real,
read-only `supabase db dump --schema public` was pulled and reviewed. Two
things below are now **confirmed facts**, not inferences:

1. **`profiles.push_token` and `pickups`'s columns match this document's
   original inference exactly** — the BC-003 migration and the BC-011 fix
   both target real, correct columns.
2. **`pickups` has three overlapping PERMISSIVE UPDATE policies**, and this
   directly validates the decision to enforce BC-003 via a trigger rather
   than an RLS policy:
   - `"Collectors can claim and update pickups"` and `"pickups_update"` —
     both let **any** authenticated collector claim any pending pickup,
     verified or not.
   - `"pickups_update_collector_ops"` — correctly restricts to
     `is_verified_collector()` (a real function: checks
     `role='COLLECTOR' AND is_verified AND onboarding_completed`).

   Because Postgres OR-combines multiple permissive policies for the same
   command, the two loose policies **completely neutralize** the one
   correct policy — any collector satisfies at least one of the first two,
   so the verified-only policy never actually gates anything in practice.
   This is a real, confirmed RLS defect independent of anything this audit
   already fixed, and it's exactly the failure mode the BC-003 trigger was
   deliberately designed not to be vulnerable to (triggers fire regardless
   of which policy let a row through). **Recommendation: drop or tighten
   the two loose policies** — the trigger closes the gap either way, but
   the policies are misleading/redundant as they stand.
3. **Realtime is confirmed working**, not just wired in code: a live
   `postgres_changes` subscription to `pickups`, `collector_locations`,
   `chat_messages`, `incident_reports`, and `broadcasts` was opened against
   the real project with the real anon key and returned `SUBSCRIBED` for
   all five, with zero data written.

The rest of this document (below) predates that pull and was written
entirely from application code while the project was paused. It has not
yet been fully reconciled column-by-column against the real dump — do that
before relying on any claim below that isn't one of the three points above.

---

**Original note (written while the project was paused, kept for context):**
Every claim below was
reconstructed by reading `supabase.from(...)` calls across `App.tsx`,
`web-admin/src/App.tsx`, and `supabase/functions/*/index.ts` — it reflects
what the application code *assumes* about the schema, not what is
necessarily and currently true in the database. Treat this as a starting
point for manual review once the project is unpaused and a real
`supabase db pull` can be run (see `migrations/README.md`), not as ground
truth. Confidence is noted per section.

## Tables the application depends on

### `profiles` (high confidence — read/written from dozens of call sites)
Columns referenced in code: `id`, `full_name`, `phone_number` (note:
`types.ts` declares this field as `phone`, but every actual runtime
read/write in `App.tsx` uses `phone_number` — the type declaration is
stale/wrong, the runtime code is internally consistent), `role`,
`avatar_url`, `wallet_balance`, `is_verified`, `onboarding_completed`,
`push_token`, `rating_average`, `vehicle_details` (JSON, holds
`kyc_docs`/`photo_url`), `address`, `loyalty_points`, `savings_goal`,
`status` (not observed being written anywhere — see BC-017 finding: no
admin action ever sets this).

Privileged writes observed against this table with **no server-side check
visible from source**:
- `profiles.is_verified = true` — written from `web-admin/src/App.tsx`
  (`handleApproveCollector`) using only the anon key, gated client-side by
  `checkUserRole` reading `profiles.role === 'ADMIN'`.
- `profiles.wallet_balance` — read in many places, **never written anywhere
  in this repository** (confirms BC-006: no wallet-crediting code exists at
  all, this isn't just an RLS question).

### `pickups` (high confidence — this session confirmed exact columns at the two writes relevant to BC-003/BC-007)
- Insert (`App.tsx:2130-2140`, customer booking creation): `customer_id`,
  `user_id`, `trash_type`, `pickup_location_name`, `pricing_ghs`, `status`,
  `voice_url`, `lat`, `lng`.
- Update — job acceptance (`App.tsx:4283-4286`, the exact write BC-003/BC-007
  touch): `collector_id`, `status`. **No `.eq('status', 'pending')` guard
  and no check of the acting user's `profiles.is_verified` — this is a
  client-side, anon-key write with no visible enforcement of either
  invariant.**
- Update — arrival: `{ status: 'arrived' }` (`App.tsx:1006`).
- Update — completion/proof: `status`, `proof_photo_url` (collector-side
  proof-of-collection flow).
- Also referenced elsewhere: `id`, `collector_id`, `customer_id`, `user_id`
  used in `.or()` history filters; `lat`/`lng` used for heatmaps
  (`web-admin`).

### Tables referenced by two or more surfaces (medium confidence — column-level detail not re-verified this session, drawn from prior audit stages' direct code reads)
- `collector_documents` — KYC file metadata, keyed by `collector_id` +
  `doc_type`; `web-admin` has an explicit code-comment fallback for when RLS
  blocks reads of this table (see RLS Risk Signals below).
- `collector_locations` — live GPS, upserted by `collector_id`
  (`onConflict: 'collector_id'`), read by both the customer tracking view
  and the admin live map.
- `incident_reports` — written from collector safety/SOS flows, **and also
  written from the customer review-submission flow** as an explicit RLS
  workaround (`type: 'REVIEW'`) — see RLS Risk Signals.
- `reviews` — customer star ratings, `reviewer_id`, `pickup_id`, `rating`,
  `comment`, `is_flagged`.
- `support_tickets` / `support_messages` — ticketed chat, both customer- and
  admin-facing.
- `chat_messages` — pickup-scoped realtime chat (both `PICKUP_CHAT` and
  `COLLECTOR_CHAT`).
- `broadcasts` — admin announcements.
- `community_pools` / `community_pool_members`.
- `scrap_listings` / `scrap_buyers`.
- `convoys` / `convoy_members`.
- `challenges` / `collector_challenges`.
- `landfills`.
- `payout_requests` — collector cash-out requests; approval calls an RPC
  (`process_payout`) whose SQL body is not in this repository.
- `refund_requests` — fetched by admin, **no processing action exists
  anywhere in the code** (BC-009).
- `subscriptions`, `card_on_file`-style fields (declared in `types.ts` as
  `CardOnFile`/`Invoice`, but never referenced by any actual query —
  likely aspirational/unused table shapes, not confirmed to exist).
- `system_settings` — admin-configurable commission/surge values.
- `payment_history` — written by the Paystack webhook; **not the same
  thing as a `pickups` payment-status field**, which does not exist
  (BC-004).
- `platform_intelligence_summary`, `daily_revenue_trend`,
  `trash_type_distribution`, `top_collectors_ranking`,
  `collector_performance_metrics` — queried read-only by the admin
  Intelligence/Performance tabs; the naming strongly suggests these are SQL
  views or materialized views rather than base tables, but this cannot be
  confirmed without a live schema pull.

### RPCs referenced but not defined anywhere in this repository
- `find_collectors_within_miles(user_lat, user_lng, radius_miles)` —
  `utils/location.ts`, drives nearby-collector matching.
- `process_payout(p_request_id)` — `web-admin/src/App.tsx`, moves funds on
  payout approval.
- `increment_wallet` — referenced from the Paystack webhook's
  `wallet_topup` branch (itself currently unreachable from the client, see
  Stage 2 payments findings).

None of these functions' SQL bodies exist in this repository. Their
correctness (e.g., does `process_payout` prevent double-processing, does
`find_collectors_within_miles` filter by `is_online`) cannot be verified
from source and must be reviewed directly in the live project once
unpaused.

## RLS risk signals (evidence the code itself provides)

These are not inferences — they are the application developers' own code
comments, which constitute direct evidence that RLS has been a known,
unresolved problem rather than something never considered:

1. `App.tsx:389` (mobile, admin-equivalent logic) — `// 2b. Fetch reviews
   saved as incidents (RLS workaround)`
2. `App.tsx:7420` (mobile) — `// 2b. Backup insert into incident_reports to
   bypass strict RLS on reviews table`
3. `web-admin/src/App.tsx:131` — `// Fallback: If RLS blocked
   collector_documents table, pull from profiles.vehicle_details.kyc_docs`

Taken together, these show a consistent pattern: rather than fixing the
underlying RLS policy, the application was changed to write to a
*different* table/column that isn't blocked, or to read from a redundant
copy of the data. This is why BC-014 exists (reviews polluting the incident
queue) — it's a direct downstream consequence of workaround #2 above.

## Client-side-only authorization (confirmed, not inferred)

Every privileged mutation observed from `web-admin/src/App.tsx` — KYC
approval, payout processing, landfill status, broadcasts, system settings —
uses the Supabase **anon key** (`web-admin/.env` /
`VITE_SUPABASE_ANON_KEY`) and is gated only by a client-side `isAdmin` React
state variable set after reading `profiles.role` (`checkUserRole`,
`web-admin/src/App.tsx:212-227`). Whether this is actually safe depends
entirely on whether RLS policies on `profiles`, `payout_requests`,
`landfills`, `broadcasts`, and `system_settings` independently restrict
writes to rows where the *authenticated* user's role is `ADMIN` — which
cannot be confirmed while the project is paused.

## What this means for BC-003

The migration added alongside this review
(`migrations/20260716000000_pickups_verified_collector_only.sql`) enforces,
at the database level, that a `pickups` row's `collector_id` can only be set
to a user whose `profiles.is_verified = true`. It is intentionally narrow —
it only touches the exact columns confirmed above — specifically so it does
not depend on the parts of the schema this document could not verify. It
still needs to be applied and tested against the real database once
unpaused; it has only been reviewed for internal SQL correctness, not
applied (see BC-003 write-up for what "validated" means for this fix).

## Recommended follow-up once the project is unpaused

1. `supabase link --project-ref gmllzbdvmhygbedqgxgf`, then
   `supabase db pull` to get the real baseline.
2. Diff that baseline against this document; correct or delete whatever
   disagrees.
3. Directly review the RLS policies on `profiles`, `payout_requests`,
   `landfills`, `broadcasts`, `system_settings`, and `incident_reports` —
   these are the tables privileged admin/collector writes depend on, per
   the evidence above.
4. Review the three RPC bodies listed above for correctness
   (idempotency/double-processing on `process_payout` in particular).
