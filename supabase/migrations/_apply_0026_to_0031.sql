-- Combined: run once in the SQL editor of project gdofcdiekmazmjznlria (TyloHQ).
-- Applies migrations 0026–0031 in order. Every statement is idempotent.
begin;

-- ===== 0026_security_hardening_4 =====
-- =====================================================================
-- Security hardening 4. Run after 0025. Idempotent.
-- =====================================================================

-- 1) HIGH: integrations_write (0003) still let a client-role user INSERT/UPDATE
--    its own integration rows directly via PostgREST. An unfiltered UPDATE needs
--    no SELECT privilege, so a client could rewrite `meta` (accountId / siteUrl /
--    propertyId) on a row holding a staff-issued token and have the next sync
--    pull another tenant's account data. Every legitimate write goes through the
--    API with the service role, so lock browser-role writes down entirely.
drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for all using (is_staff()) with check (is_staff());
revoke insert, update, delete on public.integrations from anon, authenticated;

-- 2) Track who uploaded a document so clients can remove their own uploads
--    (but never staff-issued contracts, invoices or reports).
alter table public.documents add column if not exists uploaded_by uuid references public.users (id) on delete set null;

-- ===== 0027_kpi_delta_nullable =====
-- =====================================================================
-- KPI change is unknown (not 0 %) when there's no previous period to compare.
-- Run after 0026. Idempotent.
-- =====================================================================
alter table public.kpis alter column delta drop not null;
alter table public.kpis alter column delta drop default;

-- Synced KPIs were always written with delta 0 — that was never a real value.
update public.kpis set delta = null
where delta = 0 and source in ('Meta Ads', 'Google Ads', 'GA4', 'Search Console');

-- ===== 0028_client_mrr_history =====
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

-- ===== 0029_ai_tools_audit =====
-- =====================================================================
-- Who last edited an AI tool prompt, and when (shown in the prompt editor).
-- Run after 0028. Idempotent.
-- =====================================================================
alter table public.ai_tools add column if not exists updated_at timestamptz;
alter table public.ai_tools add column if not exists updated_by uuid references public.users (id) on delete set null;

-- ===== 0030_archive_and_deactivate =====
-- =====================================================================
-- Archive clients (soft delete) and deactivate staff accounts.
-- Run after 0029. Idempotent.
-- =====================================================================
alter table public.clients add column if not exists archived_at timestamptz;
alter table public.users add column if not exists deactivated_at timestamptz;
create index if not exists idx_clients_active on public.clients (archived_at) where archived_at is null;

-- ===== 0031_activity_events =====
-- Public-safe activity stream for the marketing website's "Live aus TyloHQ" bar.
-- Spec: LIVE_FEED.md. Writes go through the service role only (lib/supabase/admin.ts).

create table if not exists activity_events (
  id           uuid primary key default uuid_generate_v4(),
  client_id    uuid not null references clients(id) on delete cascade,
  kind         text not null check (kind in ('query','visitors','leads','ranking','booking','review')),
  title        text not null check (char_length(title) between 1 and 80),
  detail       text check (detail is null or char_length(detail) <= 80),
  occurred_at  timestamptz not null,
  source       text not null check (source in ('manual','meta_ads','google_ads','ga4','search_console','form','booking','review')),
  -- idempotency key from the producer, e.g. "metric_points:<client>:<date>:meta_ads:leads=7"
  source_ref   text not null,
  hidden       boolean not null default false,   -- staff kill-switch per event
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (source, source_ref)
);

create index if not exists activity_events_recent_idx
  on activity_events (occurred_at desc) where hidden = false;
create index if not exists activity_events_client_idx
  on activity_events (client_id, occurred_at desc);

alter table activity_events enable row level security;

-- Staff see everything, clients see their own rows (same pattern as `updates`).
drop policy if exists activity_events_read on activity_events;
create policy activity_events_read on activity_events
  for select using (is_staff() or client_id = auth_client_id());
-- No insert/update/delete policies: writes go through the service role only.
revoke insert, update, delete on activity_events from anon, authenticated;

-- Consent + public label per client (default: not shown anywhere).
alter table clients
  add column if not exists public_feed_opt_in boolean not null default false,
  add column if not exists public_feed_label text
    check (public_feed_label is null or char_length(public_feed_label) <= 60);
-- e.g. public_feed_label = 'Fahrschule · Düsseldorf' (industry · city, no company name
-- unless the client explicitly wants it).

commit;
