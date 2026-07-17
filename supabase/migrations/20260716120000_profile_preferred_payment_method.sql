-- Payment Methods screen: every row (MTN MoMo, Telecel Cash, Cash Payment)
-- had no onPress handler at all -- tapping any of them did nothing, and
-- nothing was ever persisted anywhere. Real payment processing (MoMo/card
-- tokenization, actually charging anything) stays explicitly out of scope
-- for now -- this migration only adds a place to remember which method a
-- customer prefers, so the screen stops being fully decorative. The
-- collector-side pricing/payout flow does not read this column.

alter table public.profiles
  add column if not exists preferred_payment_method text;

comment on column public.profiles.preferred_payment_method is
  'Customer''s selected default payment method on the Payment Methods screen (e.g. MOMO_MTN, MOMO_TELECEL, CASH). Display preference only -- no real payment processing is wired to this yet.';
