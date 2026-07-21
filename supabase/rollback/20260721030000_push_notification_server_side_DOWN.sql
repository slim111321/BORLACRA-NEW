-- Rollback for 20260721030000_push_notification_server_side.sql

alter table public.ai_proxy_requests
  drop constraint if exists ai_proxy_requests_endpoint_check;

alter table public.ai_proxy_requests
  add constraint ai_proxy_requests_endpoint_check
  check (endpoint in ('trash_estimate', 'voice_transcribe'));

create or replace view public.profiles_public as
select
  id,
  full_name,
  phone_number,
  avatar_url,
  role,
  loyalty_points,
  vehicle_type,
  vehicle_number,
  (vehicle_details - 'kyc_docs' - 'photo_url') as vehicle_details,
  push_token
from public.profiles;
