-- Rollback for 20260718000000_pickup_payment_verification.sql

drop trigger if exists trg_enforce_customer_payment_method_only on public.pickups;
drop function if exists public.enforce_customer_payment_method_only();
drop policy if exists "pickups_customer_update_own" on public.pickups;

alter table public.pickups
  drop column if exists payment_method,
  drop column if exists payment_status;
