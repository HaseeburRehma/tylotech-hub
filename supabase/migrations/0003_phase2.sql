-- =====================================================================
-- Phase 2 — ad/analytics integrations
-- Run after 0001_init.sql. Stores per-client connected data sources.
-- =====================================================================

create table if not exists integrations (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  provider text not null,                 -- meta_ads | google_ads | ga4 | search_console
  status text not null default 'disconnected', -- connected | disconnected | error
  account_label text,
  access_token text,                      -- encrypt at rest in production (pgsodium / KMS)
  refresh_token text,
  last_synced_at timestamptz,
  meta jsonb not null default '{}'::jsonb, -- latest synced metric snapshot
  created_at timestamptz not null default now(),
  unique (client_id, provider)
);

create index if not exists idx_integrations_client on integrations (client_id);

alter table integrations enable row level security;

drop policy if exists integrations_read on integrations;
create policy integrations_read on integrations for select
  using (is_staff() or client_id = auth_client_id());

drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for all
  using (is_staff() or client_id = auth_client_id())
  with check (is_staff() or client_id = auth_client_id());
