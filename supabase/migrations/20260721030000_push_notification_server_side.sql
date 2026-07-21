-- Task #10 from the production-readiness audit: push notifications used to
-- be sent directly from the client to Expo's push API, given another
-- user's raw push_token read out of profiles_public (added there
-- specifically as a *temporary* measure in
-- 20260721020000_profiles_read_exposure_fix.sql, pending this). A client
-- holding another user's push token could send them arbitrary
-- notification content with no server involved. Sending now happens
-- server-side (supabase/functions/send-push-notification), which resolves
-- the recipient's token itself under the service-role key -- the token
-- never reaches any client.
--
-- Two small changes:
-- 1) Extend ai_proxy_requests' endpoint check constraint to also accept
--    'push_notification', so the new edge function can reuse the existing
--    check_and_log_ai_proxy_request() quota mechanism instead of a
--    parallel one.
-- 2) Drop push_token from profiles_public -- no client code needs to read
--    it anymore (see the App.tsx/utils/notifications.ts changes in this
--    same commit).

alter table public.ai_proxy_requests
  drop constraint if exists ai_proxy_requests_endpoint_check;

alter table public.ai_proxy_requests
  add constraint ai_proxy_requests_endpoint_check
  check (endpoint in ('trash_estimate', 'voice_transcribe', 'push_notification'));

-- CREATE OR REPLACE VIEW cannot drop a column from an existing view (only
-- append new ones) -- dropping push_token requires a real DROP + CREATE,
-- which also means the grant needs reapplying afterward.
drop view if exists public.profiles_public;

create view public.profiles_public as
select
  id,
  full_name,
  phone_number,
  avatar_url,
  role,
  loyalty_points,
  vehicle_type,
  vehicle_number,
  (vehicle_details - 'kyc_docs' - 'photo_url') as vehicle_details
from public.profiles;

grant select on public.profiles_public to authenticated;
