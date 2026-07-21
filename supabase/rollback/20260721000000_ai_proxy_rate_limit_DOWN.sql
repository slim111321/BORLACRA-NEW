-- Rollback for 20260721000000_ai_proxy_rate_limit.sql
-- Drops the rate-limit function and table entirely. Safe to run any time --
-- nothing else in the schema depends on either object.

drop function if exists public.check_and_log_ai_proxy_request(uuid, text, integer);
drop table if exists public.ai_proxy_requests;
