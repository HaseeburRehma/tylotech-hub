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
