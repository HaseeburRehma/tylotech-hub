-- =====================================================================
-- Tag daily metric_points by provider so Meta Ads / Google Ads / Search
-- Console / GA4 performance can be viewed and filtered separately instead
-- of being summed into one blended row per day. Run after 0021. Idempotent.
-- =====================================================================

alter table public.metric_points add column if not exists provider text;

-- Backfill: every existing row predates per-provider tracking. In practice
-- the only real rows in production so far came from Search Console syncs
-- (spend/roas are 0, leads holds the daily click count) — tag those as
-- such; anything with real spend or roas is genuine ad spend, tag as
-- meta_ads (the more commonly connected of the two ad platforms). Going
-- forward every sync writes its own provider, so this is a one-time guess
-- for pre-existing rows only.
update public.metric_points
set provider = case when spend = 0 and roas = 0 then 'search_console' else 'meta_ads' end
where provider is null;

alter table public.metric_points alter column provider set not null;

-- Replace the single (client_id, date) row with one per (client_id, date,
-- provider) so multiple sources can coexist without clobbering each other.
alter table public.metric_points drop constraint if exists metric_points_client_id_date_key;
create unique index if not exists metric_points_client_date_provider_key
  on public.metric_points (client_id, date, provider);

create index if not exists idx_metric_points_client_provider
  on public.metric_points (client_id, provider, date);
