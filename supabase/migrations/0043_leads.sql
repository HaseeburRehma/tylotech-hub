-- =====================================================================
-- Leads: every enquiry from Meta lead forms, Google Ads lead forms, website
-- forms / Zapier webhooks or entered by hand — one list per partner, worked by
-- the partner's sales people (status, owner, appointment, notes).
-- Run after 0042. Idempotent.
--
--   lead_sources     where leads come from (Meta page, Google Ads form
--                    webhook, generic webhook). Holds keys/tokens → API only.
--   leads            one row per lead, numbered per partner (#1, #2, …).
--   lead_activities  timeline: created, status changes, owner, notes, calls.
-- Reads: the team and the partner's own users (RLS). Writes go through the API.
-- =====================================================================

create table if not exists public.lead_sources (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  kind             text not null check (kind in ('meta', 'google_ads', 'webhook')),
  label            text not null check (char_length(label) between 1 and 120),
  secret           text,                -- webhook key (google_ads / webhook)
  external_id      text,                -- Meta page id
  access_token     text,                -- Meta page access token
  status           text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error       text,
  last_received_at timestamptz,
  last_synced_at   timestamptz,
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now()
);
-- One row per partner and Meta page (NULL external ids — webhooks — never collide).
do $$
begin
  alter table lead_sources add constraint uq_lead_sources_page unique (client_id, kind, external_id);
exception when duplicate_object or duplicate_table then null;
end;
$$;
create index if not exists idx_lead_sources_client on lead_sources (client_id);
alter table lead_sources enable row level security;
revoke all on lead_sources from anon, authenticated;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  lead_no          int not null,
  source           text not null check (source in ('meta', 'google_ads', 'webhook', 'manual', 'import')),
  source_id        uuid references lead_sources (id) on delete set null,
  external_id      text,
  name             text check (name is null or char_length(name) <= 200),
  email            text check (email is null or char_length(email) <= 320),
  phone            text check (phone is null or char_length(phone) <= 60),
  campaign         text,
  ad_group         text,
  ad               text,
  form             text,
  platform         text,                -- facebook / instagram / google / website …
  fields           jsonb not null default '[]'::jsonb,   -- every answer: [{ "label": "...", "value": "..." }]
  status           text not null default 'new'
                   check (status in ('new', 'contacted', 'not_reached', 'appointment_set', 'appointment_done', 'offer_sent', 'won', 'lost', 'invalid')),
  assigned_to      uuid references users (id) on delete set null,
  appointment_at   timestamptz,
  value            numeric(12, 2),
  lost_reason      text check (lost_reason is null or char_length(lost_reason) <= 500),
  is_test          boolean not null default false,
  created_at       timestamptz not null default now(),   -- when the lead was submitted
  received_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (client_id, lead_no)
);
create unique index if not exists uq_leads_external on leads (client_id, source, external_id) where external_id is not null;
create index if not exists idx_leads_client_created on leads (client_id, created_at desc);
create index if not exists idx_leads_client_status on leads (client_id, status);
create index if not exists idx_leads_assigned on leads (assigned_to) where assigned_to is not null;

-- Lead numbers count per partner (#1, #2, …), safe under concurrent inserts.
create or replace function public.leads_assign_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('leads:' || new.client_id::text));
  select coalesce(max(lead_no), 0) + 1 into new.lead_no from leads where client_id = new.client_id;
  return new;
end;
$$;
drop trigger if exists trg_leads_no on leads;
create trigger trg_leads_no before insert on leads for each row execute function leads_assign_no();

alter table leads enable row level security;
drop policy if exists leads_read on leads;
create policy leads_read on leads for select using (is_staff() or client_id = auth_client_id());
revoke insert, update, delete on leads from anon, authenticated;

create table if not exists public.lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  client_id  uuid not null references clients (id) on delete cascade,
  user_id    uuid references users (id) on delete set null,
  kind       text not null check (kind in ('created', 'status', 'assign', 'note', 'call', 'email', 'appointment', 'value', 'edit')),
  body       text check (body is null or char_length(body) <= 4000),
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_activities_lead on lead_activities (lead_id, created_at);
alter table lead_activities enable row level security;
drop policy if exists lead_activities_read on lead_activities;
create policy lead_activities_read on lead_activities for select using (is_staff() or client_id = auth_client_id());
revoke insert, update, delete on lead_activities from anon, authenticated;

-- Live updates in the Leads list.
do $$
begin
  alter publication supabase_realtime add table leads;
exception when others then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table lead_activities;
exception when others then null;
end;
$$;
