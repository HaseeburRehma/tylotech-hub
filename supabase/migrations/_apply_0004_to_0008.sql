-- ===== Combined apply: migrations 0004 → 0008 (idempotent, safe to re-run) =====

-- ---------- 0004_projects_and_seed.sql ----------
-- =====================================================================
-- Project assignment + demo content seed
-- Run after 0001/0002/0003. Idempotent.
-- =====================================================================

-- Link a project to the team member responsible (in addition to the display name).
alter table projects add column if not exists assigned_to_id uuid references users (id) on delete set null;
create index if not exists idx_projects_assignee on projects (assigned_to_id);

-- Make per-client seed re-runnable.
delete from kpis where client_id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from updates where client_id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from documents where client_id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into kpis (client_id, metric_name, label, value, unit, delta, period, source) values
  ('11111111-1111-1111-1111-111111111111', 'ad_spend', 'Monthly Ad Spend', 18400, 'currency', 12.4, 'Jun 2026', 'Meta Ads'),
  ('11111111-1111-1111-1111-111111111111', 'leads',    'Leads Generated',  342,   'number',   23.1, 'Jun 2026', 'Meta Ads'),
  ('11111111-1111-1111-1111-111111111111', 'cpl',      'Cost Per Lead',    53.8,  'currency', -8.6, 'Jun 2026', 'Google Ads'),
  ('11111111-1111-1111-1111-111111111111', 'roas',     'ROAS',             4.7,   'ratio',    0.6,  'Jun 2026', 'Meta Ads'),
  ('22222222-2222-2222-2222-222222222222', 'ad_spend', 'Monthly Ad Spend', 9200,  'currency', 6.1,  'Jun 2026', 'Meta Ads'),
  ('22222222-2222-2222-2222-222222222222', 'leads',    'Leads Generated',  188,   'number',   14.7, 'Jun 2026', 'Meta Ads'),
  ('22222222-2222-2222-2222-222222222222', 'cpl',      'Cost Per Lead',    48.9,  'currency', -4.2, 'Jun 2026', 'Google Ads'),
  ('22222222-2222-2222-2222-222222222222', 'roas',     'ROAS',             3.9,   'ratio',    0.3,  'Jun 2026', 'Meta Ads');

insert into updates (client_id, title, description, type, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'June campaign hit 4.7x ROAS', 'Retargeting outperformed by 18%. Reallocating budget into winning audiences.', 'milestone', now() - interval '2 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Monthly performance report ready', 'Your June report is in Documents with a full channel breakdown.', 'report', now() - interval '6 hours'),
  ('11111111-1111-1111-1111-111111111111', 'New ad creative batch live', '8 new video creatives launched across Meta. Early CTR 2.3%.', 'campaign', now() - interval '1 day'),
  ('22222222-2222-2222-2222-222222222222', 'Membership funnel launched', 'New 3-step funnel live; first conversions tracking in.', 'milestone', now() - interval '5 hours');

insert into documents (client_id, name, file_url, type, size, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'June 2026 Performance Report.pdf', '#', 'report',   '2.4 MB', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', 'Service Agreement — Scale Plan.pdf', '#', 'contract', '640 KB', now() - interval '120 days'),
  ('11111111-1111-1111-1111-111111111111', 'Invoice #2026-0612.pdf', '#', 'invoice', '180 KB', now() - interval '22 days'),
  ('22222222-2222-2222-2222-222222222222', 'Velform Onboarding Pack.pdf', '#', 'contract', '512 KB', now() - interval '40 days');

-- Projects, assigned to real team members where they exist.
delete from projects where client_id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into projects (client_id, name, status, progress, assigned_to, assigned_to_id, due)
select '11111111-1111-1111-1111-111111111111'::uuid, 'Q3 Meta Ads Scaling', 'in_progress'::project_status, 68, 'Sofia Lind',
       (select id from users where email = 'team@tylotech.de'), date '2026-07-15'
union all
select '11111111-1111-1111-1111-111111111111', 'Landing Page Redesign', 'review', 90, 'Sofia Lind',
       (select id from users where email = 'team@tylotech.de'), date '2026-06-28'
union all
select '11111111-1111-1111-1111-111111111111', 'SEO Content Cluster', 'in_progress', 42, 'Ilias El Aradi',
       (select id from users where email = 'admin@tylotech.de'), date '2026-07-30'
union all
select '22222222-2222-2222-2222-222222222222', 'Membership Funnel', 'in_progress', 55, 'Sofia Lind',
       (select id from users where email = 'team@tylotech.de'), date '2026-07-20'
union all
select '22222222-2222-2222-2222-222222222222', 'Brand Refresh', 'planning', 15, 'Ilias El Aradi',
       (select id from users where email = 'admin@tylotech.de'), date '2026-08-12';


-- ---------- 0005_chat_and_storage.sql ----------
-- =====================================================================
-- Live chat (Realtime) + logo storage
-- Run after 0001–0004. Idempotent.
-- =====================================================================

-- Denormalize sender identity so clients can render team names without needing
-- read access to staff user rows (RLS keeps staff profiles private otherwise).
alter table messages add column if not exists sender_name text;
alter table messages add column if not exists sender_role text;

-- Enable Supabase Realtime on the messages table.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Public bucket for client logos (uploads happen server-side via the service role).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Seed a short conversation for the Nordic demo client.
delete from messages where client_id = '11111111-1111-1111-1111-111111111111';

insert into messages (client_id, sender_id, sender_name, sender_role, content, created_at)
select '11111111-1111-1111-1111-111111111111'::uuid,
       (select id from users where email = 'team@tylotech.de'),
       'Sofia Lind', 'team',
       'Morning Marcus! June numbers are in — 4.7x ROAS 🎉', now() - interval '58 minutes'
union all
select '11111111-1111-1111-1111-111111111111',
       (select id from users where email = 'marcus@nordicestate.com'),
       'Marcus Holt', 'client',
       'That is brilliant. Can we push more budget into the winning audiences?', now() - interval '52 minutes'
union all
select '11111111-1111-1111-1111-111111111111',
       (select id from users where email = 'team@tylotech.de'),
       'Sofia Lind', 'team',
       'Already on it — reallocating €3k today. Revised projection this afternoon.', now() - interval '47 minutes';


-- ---------- 0006_documents_storage.sql ----------
-- =====================================================================
-- Private storage bucket for client documents (contracts, reports, invoices).
-- Downloads are served via short-lived signed URLs from the API.
-- Run after 0001–0005. Idempotent.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;


-- ---------- 0007_metrics_notifications.sql ----------
-- =====================================================================
-- Time-series metrics + in-app notifications
-- Run after 0001–0006. Idempotent.
-- =====================================================================

-- Daily performance points per client (fed by integration sync).
create table if not exists metric_points (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  date date not null,
  spend numeric not null default 0,
  leads integer not null default 0,
  roas numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (client_id, date)
);
create index if not exists idx_metric_points_client on metric_points (client_id, date);

alter table metric_points enable row level security;
drop policy if exists metric_points_read on metric_points;
create policy metric_points_read on metric_points for select
  using (is_staff() or client_id = auth_client_id());
drop policy if exists metric_points_write on metric_points;
create policy metric_points_write on metric_points for all
  using (is_staff() or client_id = auth_client_id())
  with check (is_staff() or client_id = auth_client_id());

-- Per-user in-app notifications (created server-side via the service role).
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users (id) on delete cascade,
  title text not null,
  body text,
  href text,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications (user_id, created_at desc);

alter table notifications enable row level security;
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select
  using (user_id = auth.uid());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;


-- ---------- 0008_message_translation.sql ----------
-- =====================================================================
-- Auto-translation for chat.
-- Client messages (German) are translated to English for the team;
-- team messages (English) are translated to German for the client.
-- Run after 0001–0007. Idempotent.
-- =====================================================================

alter table messages add column if not exists content_translated text;
alter table messages add column if not exists translated_to text; -- 'en' | 'de'


