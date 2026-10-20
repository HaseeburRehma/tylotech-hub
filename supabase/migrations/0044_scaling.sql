-- =====================================================================
-- Scaling & resilience. Run after 0043. Idempotent.
--
-- 1) Distributed rate limiting: Vercel runs many short-lived instances, so an
--    in-memory counter per instance is easy to bypass and resets on every cold
--    start. Counters live in Postgres instead (one atomic upsert per check);
--    UNLOGGED = no WAL overhead, it's throwaway state. Upstash still wins when
--    configured.
-- 2) Indexes for the hot paths: chat inbox (per-partner unread / waiting),
--    unread notification counts, search on translated message text, the leads
--    list per owner/status, and reading a conversation newest-first.
-- =====================================================================

-- ------------------------------------------------------- 1) rate limits
create unlogged table if not exists public.rate_limits (
  key        text primary key,
  count      int not null,
  reset_at   timestamptz not null
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_sec int)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  r rate_limits;
begin
  insert into rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_sec))
  on conflict (key) do update
    set count    = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case when rl.reset_at <= now() then now() + make_interval(secs => p_window_sec) else rl.reset_at end
  returning * into r;

  -- Opportunistic cleanup (~1 in 200 calls) keeps the table small.
  if random() < 0.005 then
    delete from rate_limits where reset_at < now() - interval '1 hour';
  end if;

  return query select r.count <= p_limit, greatest(0, p_limit - r.count), r.reset_at;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ------------------------------------------------------------ 2) indexes
-- chat_inbox(): client messages per partner after a point in time.
create index if not exists idx_messages_client_role_created on messages (client_id, sender_role, created_at desc) where client_id is not null;
-- DMs to a person (unread DMs in the inbox).
create index if not exists idx_messages_recipient_created on messages (recipient_id, created_at desc) where recipient_id is not null;
-- Unread badge in the bell.
create index if not exists idx_notifications_unread on notifications (user_id, created_at desc) where read = false;
-- Message search also matches the stored translation.
create index if not exists idx_messages_translated_trgm on messages using gin (content_translated gin_trgm_ops) where content_translated is not null;
-- Leads: "assigned to me", filters, and the open-leads count.
create index if not exists idx_leads_client_owner on leads (client_id, assigned_to, created_at desc);
-- Internal team chat newest-first (client_id is null).
create index if not exists idx_messages_internal_created on messages (created_at desc) where client_id is null;

analyze messages;
analyze notifications;
analyze leads;
