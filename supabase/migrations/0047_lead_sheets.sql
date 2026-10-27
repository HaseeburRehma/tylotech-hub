-- =====================================================================
-- Leads from Google Sheets + lead tags. Run after 0046. Idempotent.
--
--   lead_sources.kind 'google_sheet'  a spreadsheet the partner's website
--                    forms write into (one row per enquiry). Read every minute
--                    with the connecting person's Google grant (read-only);
--                    the refresh token sits in access_token, API only.
--   lead_sources.config               per-source settings: chosen tabs, sheet
--                    time zone and a fingerprint per lead so unchanged rows
--                    are skipped.
--   leads.tags                         short labels from the source, e.g.
--                    "Vollständig", "Teil-Lead", "Retreat".
-- =====================================================================

alter table public.lead_sources drop constraint if exists lead_sources_kind_check;
alter table public.lead_sources
  add constraint lead_sources_kind_check check (kind in ('meta', 'google_ads', 'webhook', 'google_sheet'));

alter table public.lead_sources add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.leads add column if not exists tags text[] not null default '{}'::text[];
create index if not exists idx_leads_tags on public.leads using gin (tags);
