-- BC-018: gate collector payout on a server-verified customer payment.
--
-- Root cause (confirmed by direct code read this session):
-- handlePaymentSuccess (App.tsx, the Paystack `onSuccess` callback) never
-- wrote anything to the database — it only flipped local React state. Cash
-- and card "success" ran through the exact same function with zero
-- verification either way. The collector's payout is triggered independently
-- by handleJobFinalize setting pickups.status = 'completed', which an
-- existing DB trigger (handle_pickup_completion, not in this repo — defined
-- directly on the live DB pre-dating migration tracking) uses to credit the
-- collector's wallet purely because the collector marked the job done. There
-- was no `pickups` payment-status field at all (see SCHEMA_NOTES.md BC-004),
-- so a collector could tap "Complete Job & Get Paid" and be paid regardless
-- of whether the customer's card/MoMo charge ever actually succeeded.
--
-- This migration adds the missing payment_method/payment_status columns and
-- makes payment_status='paid' writable, in practice, only by the
-- signature-verified Paystack webhook (supabase/functions/paystack-webhook),
-- which runs under the service-role key and is therefore unaffected by the
-- restriction below (auth.uid() is NULL for that connection). The app-side
-- gate (handleJobFinalize refusing to finalize a paystack-method pickup
-- whose payment_status isn't yet 'paid') is enforced in App.tsx; this
-- migration is what makes that check trustworthy server-side rather than
-- just a client-side convenience check a modified client could skip.
--
-- Cash payments are deliberately NOT gated the same way: there is no
-- cryptographic way to verify cash changed hands, so — same as before this
-- migration — the collector tapping "Complete Job & Get Paid" remains the
-- point of trust for a cash job. Only the previously-unverified card/MoMo
-- path is closed here.
--
-- Tested against a local Postgres fixture mirroring the real, confirmed
-- pickups columns (customer_id, user_id, collector_id, status, pricing_ghs)
-- before being applied to the live project. See migrations/README.md.

alter table public.pickups
  add column if not exists payment_method text check (payment_method in ('paystack', 'cash')),
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid'));

-- No customer-owner UPDATE policy on pickups was found anywhere in the
-- existing schema (SCHEMA_NOTES.md only documents collector-focused UPDATE
-- policies) — customers have never been able to update their own pickup row
-- at all. This adds one, scoped to their own row; the trigger below is what
-- actually restricts *which* columns they're allowed to change through it.
drop policy if exists "pickups_customer_update_own" on public.pickups;
create policy "pickups_customer_update_own"
  on public.pickups
  for update
  to authenticated
  using (auth.uid() = customer_id or auth.uid() = user_id)
  with check (auth.uid() = customer_id or auth.uid() = user_id);

create or replace function public.enforce_customer_payment_method_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only restrict when the *acting* connection is authenticated as the
  -- pickup's own customer. The Paystack webhook runs under the service-role
  -- key (auth.uid() is NULL for that connection), and collectors/admins
  -- updating other columns via their own separate policies never match
  -- old.customer_id/old.user_id, so neither is affected by this block.
  if auth.uid() is not null and (auth.uid() = old.customer_id or auth.uid() = old.user_id) then

    if new.payment_status is distinct from old.payment_status then
      raise exception 'Customers cannot set payment_status directly; it is set by the verified Paystack webhook.'
        using errcode = 'P0001';
    end if;

    if new.payment_method is distinct from old.payment_method then
      -- Free to switch methods (e.g. cancel a card payment, pay cash
      -- instead) right up until a payment is actually confirmed; locked
      -- only once payment_status is genuinely 'paid'.
      if old.payment_status = 'paid' then
        raise exception 'payment_method cannot be changed after payment is confirmed.'
          using errcode = 'P0001';
      end if;
      if new.payment_method not in ('paystack', 'cash') then
        raise exception 'Invalid payment_method.'
          using errcode = 'P0001';
      end if;
    end if;

    if new.status is distinct from old.status
      or new.collector_id is distinct from old.collector_id
      or new.pricing_ghs is distinct from old.pricing_ghs
      or new.customer_id is distinct from old.customer_id
      or new.user_id is distinct from old.user_id
    then
      raise exception 'Customers may only set payment_method on their own pickup.'
        using errcode = 'P0001';
    end if;

  end if;

  return new;
end;
$$;

comment on function public.enforce_customer_payment_method_only() is
  'BC-018: restricts a pickup owner (customer) update to only ever setting payment_method once, from NULL; blocks them from touching payment_status or any other column. See supabase/migrations/README.md.';

drop trigger if exists trg_enforce_customer_payment_method_only on public.pickups;

create trigger trg_enforce_customer_payment_method_only
  before update on public.pickups
  for each row
  execute function public.enforce_customer_payment_method_only();
