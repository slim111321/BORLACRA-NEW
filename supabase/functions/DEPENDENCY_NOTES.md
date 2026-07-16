# Edge function dependency alignment (BC-037)

## What changed
All three edge functions now pin the same `@supabase/supabase-js` version:

| Function | Before | After |
|---|---|---|
| `ussd-webhook` | `@2.7.1` (pinned) | `@2.91.0` (pinned) |
| `whatsapp-webhook` | `@2.7.1` (pinned) | `@2.91.0` (pinned) |
| `paystack-webhook` | `@2` (floating — resolves to "latest 2.x" on every cold start) | `@2.91.0` (pinned) |

`2.91.0` was chosen because it's already the resolved version in two of the
three npm-based sub-projects (root mobile app and `web-arch`) — this reduces
the platform from 3 distinct in-use versions (`2.7.1`, `2.91.0`,
`2.105.4`-in-web-admin) down to 2, without introducing a *fourth* value.
`paystack-webhook`'s import was also changed from floating (`@2`) to
pinned, for the same reason BC-037 exists at all: an unpinned import is a
silent, uncontrolled drift risk on every deploy, not just a one-time gap.

## Why this was the right scope for this pass, and web-admin/root/web-arch's npm versions were deliberately NOT touched here
The audit's BC-037 also flagged React/TypeScript/`@supabase/supabase-js`
version drift across the three **npm-based** sub-projects (root, web-admin,
web-arch). That was deliberately left alone in this pass:

- Bumping shared dependencies across three independent `node_modules` trees
  (a React Native/Expo app, two separate Vite apps) risks pulling in
  breaking changes in React 19.x/TypeScript 6.x/`supabase-js` minor
  releases that I cannot adequately verify — there is no device/simulator
  available to exercise the mobile app's runtime behavior beyond bundling,
  and the live database is still paused (BC-015), so I can't test
  Supabase-client behavioral differences against it either.
- `web-arch` is documented elsewhere (Stage 1 audit) as orphaned,
  disconnected prototype scaffolding — realigning its dependencies has
  near-zero value until a decision is made on whether to keep it at all.
- This exceeds "smallest safe change necessary" for this milestone. The
  edge-function fix above was verifiable end-to-end (see below) and low
  risk (three files, a version string each, same major version, easily
  reversible); a cross-project npm dependency bump is neither.

**Recommendation**: treat the npm-side version alignment as its own,
separately-scoped piece of work, ideally paired with real device/simulator
testing and a reachable staging database — not bundled into this fix.

## Verification performed
Deno import resolution can't be checked with a local `tsc`/babel pass (no
Deno CLI available in this environment) — these run in Supabase's hosted
Edge Runtime, not Node. Instead, verified against the real thing: started
the local Supabase stack (`supabase start`, Docker) with its bundled Deno
Edge Runtime, ran `supabase functions serve`, and invoked all three
functions over HTTP:

- `whatsapp-webhook` (GET, Meta verification handshake shape) → `403
  Forbidden` — the function's own verify-token check ran and correctly
  rejected a bogus token; not an import error.
- `ussd-webhook` (POST) → `200` with a graceful `"System Error"` JSON body
  — reached its Supabase `.from(...)` call (which failed only because the
  local test fixture didn't include a `ussd_sessions` table) and handled
  the error gracefully; confirms `createClient()` under `2.91.0` works.
- `paystack-webhook` (POST) → `400 "No signature found"` — its own
  HMAC-signature check ran and correctly rejected the unsigned test
  request; not an import error.

All three responses are the functions' own business-logic rejections, not
module-resolution failures — confirming the version bump loads and executes
correctly under real Deno, not just "looks right" on paper. Stack was fully
torn down afterward (`supabase stop --no-backup`); no lingering containers,
volumes, or fixture data.
