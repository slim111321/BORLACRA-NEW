-- Rate limiting for the new AI-provider proxy edge functions
-- (ai-trash-estimate, voice-transcribe).
--
-- Context: NVIDIA/Groq/Anthropic/Gemini API keys used to ship inside the
-- compiled client app via EXPO_PUBLIC_* env vars -- extractable from the
-- app binary (or just the outgoing Authorization header) with nothing
-- stopping unlimited requests against them. The keys have moved server-side
-- into two new edge functions (see supabase/functions/ai-trash-estimate and
-- supabase/functions/voice-transcribe); this migration adds the per-user
-- daily quota those functions enforce before spending a real provider call,
-- so closing the key-exposure hole doesn't just trade it for unlimited
-- platform-paid usage by any single authenticated user instead.
--
-- No RLS policies are defined for ai_proxy_requests: it is only ever
-- touched by the edge functions via the service-role key (which bypasses
-- RLS), through check_and_log_ai_proxy_request() below. A logged-in user
-- has no direct grant to read or write it.

create table if not exists public.ai_proxy_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint in ('trash_estimate', 'voice_transcribe')),
  created_at timestamptz not null default now()
);

create index if not exists ai_proxy_requests_user_endpoint_created_idx
  on public.ai_proxy_requests (user_id, endpoint, created_at);

alter table public.ai_proxy_requests enable row level security;

-- Atomically checks the caller's rolling 24h request count against
-- p_daily_limit and, if under it, logs this request in the same
-- transaction. pg_advisory_xact_lock serializes concurrent calls for the
-- same (user, endpoint) pair so a burst of parallel requests can't all read
-- the same under-limit count before any of them commits their insert --
-- without it, N concurrent requests could each pass the check and the
-- limit would only apply to sequential traffic.
create or replace function public.check_and_log_ai_proxy_request(
  p_user_id uuid,
  p_endpoint text,
  p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_endpoint, 0));

  select count(*) into v_count
  from public.ai_proxy_requests
  where user_id = p_user_id
    and endpoint = p_endpoint
    and created_at >= now() - interval '24 hours';

  if v_count >= p_daily_limit then
    return false;
  end if;

  insert into public.ai_proxy_requests (user_id, endpoint)
  values (p_user_id, p_endpoint);

  return true;
end;
$$;

-- Only the edge functions (running under the service-role key) call this --
-- not exposed to anon or authenticated directly, so a client can't forge
-- quota log entries or probe another user's usage via RPC.
revoke all on function public.check_and_log_ai_proxy_request(uuid, text, integer) from public;
revoke all on function public.check_and_log_ai_proxy_request(uuid, text, integer) from anon;
revoke all on function public.check_and_log_ai_proxy_request(uuid, text, integer) from authenticated;
grant execute on function public.check_and_log_ai_proxy_request(uuid, text, integer) to service_role;
