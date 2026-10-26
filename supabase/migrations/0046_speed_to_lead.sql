-- =====================================================================
-- Speed-to-Lead: claim lock + call tracking on leads. Run after 0045. Idempotent.
--
-- When a new lead arrives, the right people get a notification with a 60-second
-- countdown and claim it with one tap. The claim must be atomic — two people
-- tapping at the same moment: exactly one wins. `leads` is already in the
-- supabase_realtime publication (0043), so the card appears and disappears live.
-- =====================================================================

alter table public.leads add column if not exists claimed_by      uuid references users (id) on delete set null;
alter table public.leads add column if not exists claimed_at      timestamptz;
alter table public.leads add column if not exists call_started_at timestamptz;

-- Hot path: the unclaimed, still-fresh leads a tenant is racing to answer.
create index if not exists idx_leads_unclaimed on public.leads (client_id, created_at desc)
  where claimed_at is null and status = 'new';

-- Atomic claim: the UPDATE … WHERE claimed_at IS NULL means the first caller
-- wins and everyone else gets zero rows back ("Already taken"). Claiming also
-- takes ownership (unless someone was already assigned by hand).
create or replace function public.lead_claim(p_lead uuid, p_user uuid, p_call boolean default false)
returns setof public.leads
language sql
security definer
set search_path = public
as $$
  update public.leads
     set claimed_by      = p_user,
         claimed_at      = now(),
         assigned_to     = coalesce(assigned_to, p_user),
         call_started_at = case when p_call then coalesce(call_started_at, now()) else call_started_at end,
         updated_at      = now(),
         last_activity_at = now()
   where id = p_lead and claimed_at is null
  returning *;
$$;

revoke all on function public.lead_claim(uuid, uuid, boolean) from public, anon, authenticated;
