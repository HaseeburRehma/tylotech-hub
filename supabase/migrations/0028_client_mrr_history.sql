-- =====================================================================
-- MRR history: one row per MRR change, so the revenue chart reflects what was
-- actually billed each month instead of back-dating today's prices.
-- Run after 0027. Idempotent.
-- =====================================================================
create table if not exists public.client_mrr_history (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients (id) on delete cascade,
  mrr numeric not null default 0,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_mrr_history_client on public.client_mrr_history (client_id, effective_from);

alter table public.client_mrr_history enable row level security;
drop policy if exists mrr_history_staff on public.client_mrr_history;
create policy mrr_history_staff on public.client_mrr_history for all using (is_staff()) with check (is_staff());
revoke all on public.client_mrr_history from anon;

-- Seed: each existing client's current MRR from its start date (the best record
-- available today; every later change is appended by the app).
insert into public.client_mrr_history (client_id, mrr, effective_from)
select c.id, coalesce(c.mrr, 0), c.created_at::date
from public.clients c
where not exists (select 1 from public.client_mrr_history h where h.client_id = c.id);
