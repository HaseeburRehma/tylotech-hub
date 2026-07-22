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
