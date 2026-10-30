-- =====================================================================
-- Creatives: platform(s) and campaign per creative, for the filters on
-- the Creatives page (like Leads). Set by the team at upload or later;
-- platforms are also guessed from folder and file names.
-- Run after 0048. Idempotent.
-- =====================================================================

alter table public.creatives add column if not exists platforms text[] not null default '{}';
alter table public.creatives add column if not exists campaign text;

do $$
begin
  alter table creatives add constraint creatives_platforms_check check (
    cardinality(platforms) <= 10
    and platforms <@ array['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google', 'pinterest', 'snapchat', 'x', 'website']::text[]
  );
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table creatives add constraint creatives_campaign_check check (campaign is null or char_length(campaign) between 1 and 200);
exception when duplicate_object then null;
end;
$$;

create index if not exists idx_creatives_campaign on creatives (client_id, campaign) where campaign is not null;
create index if not exists idx_creatives_platforms on creatives using gin (platforms);
