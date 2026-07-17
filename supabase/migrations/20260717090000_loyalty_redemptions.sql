-- Fuel Hub "Activate Voucher" (GOIL) used to just show a static Alert and
-- do nothing real -- no points were spent, no voucher was ever actually
-- issued or recorded anywhere. This adds a real, minimal redemption ledger
-- so activating a voucher has a real cost (loyalty_points) and produces a
-- real, persisted voucher code the collector can look back up.
--
-- Deliberately narrow: one reward type for now (GOIL fuel voucher). Shell's
-- "Learn More" stays informational -- it never claimed to instantly grant
-- anything, unlike "Activate Voucher".

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  collector_id uuid not null,
  reward_type text not null check (reward_type in ('GOIL_FUEL_VOUCHER')),
  points_spent integer not null check (points_spent > 0),
  voucher_code text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REDEEMED', 'EXPIRED')),
  created_at timestamp with time zone not null default timezone('utc', now())
);

create index if not exists idx_loyalty_redemptions_collector on public.loyalty_redemptions(collector_id);

alter table public.loyalty_redemptions enable row level security;

create policy "loyalty_redemptions_select_own" on public.loyalty_redemptions
  for select using (collector_id = auth.uid());

create policy "loyalty_redemptions_insert_own" on public.loyalty_redemptions
  for insert with check (collector_id = auth.uid());

comment on table public.loyalty_redemptions is
  'Real redemption ledger for the Fuel Hub / loyalty rewards screen -- replaces the old fire-and-forget Alert that never spent points or issued anything.';
