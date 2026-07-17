-- Rollback for 20260716120000_profile_preferred_payment_method.sql

alter table public.profiles
  drop column if exists preferred_payment_method;
