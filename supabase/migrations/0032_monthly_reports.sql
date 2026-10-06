-- =====================================================================
-- Monthly PDF performance reports emailed to clients.
-- Opt-in per client (off by default); one run per client and month.
-- Run after 0031. Idempotent.
-- =====================================================================
alter table public.clients add column if not exists monthly_report_enabled boolean not null default false;

create table if not exists public.report_runs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- 'YYYY-MM'
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  recipients integer not null default 0,
  document_id uuid references public.documents (id) on delete set null,
  error text,
  triggered_by uuid references public.users (id) on delete set null,   -- null = monthly cron
  created_at timestamptz not null default now(),
  unique (client_id, period)
);
create index if not exists idx_report_runs_client on public.report_runs (client_id, created_at desc);

alter table public.report_runs enable row level security;
drop policy if exists report_runs_read on public.report_runs;
create policy report_runs_read on public.report_runs for select using (is_staff());
-- Writes go through the service role only.
revoke insert, update, delete on public.report_runs from anon, authenticated;
