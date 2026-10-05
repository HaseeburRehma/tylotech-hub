-- =====================================================================
-- KPI change is unknown (not 0 %) when there's no previous period to compare.
-- Run after 0026. Idempotent.
-- =====================================================================
alter table public.kpis alter column delta drop not null;
alter table public.kpis alter column delta drop default;

-- Synced KPIs were always written with delta 0 — that was never a real value.
update public.kpis set delta = null
where delta = 0 and source in ('Meta Ads', 'Google Ads', 'GA4', 'Search Console');
