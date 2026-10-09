-- =====================================================================
-- Search Console detail for the Leistung page. Run after 0037. Idempotent.
--
-- 1) Daily average position (Search Console rows only) so "Ø Position" gets a
--    real trend + sparkline instead of a single last-sync number.
-- 2) Top pages of the last 30 days per client ("Top-Seiten aus der Search
--    Console"), replaced on every successful Search Console sync.
-- =====================================================================

alter table metric_points add column if not exists position numeric;

create table if not exists search_console_pages (
  client_id   uuid not null references clients (id) on delete cascade,
  page        text not null check (char_length(page) <= 2048),
  clicks      int not null default 0,
  impressions int not null default 0,
  ctr         numeric not null default 0,   -- 0..1, as Search Console reports it
  position    numeric not null default 0,
  start_date  date not null,
  end_date    date not null,
  synced_at   timestamptz not null default now(),
  primary key (client_id, page)
);

create index if not exists idx_sc_pages_client_clicks on search_console_pages (client_id, clicks desc);

alter table search_console_pages enable row level security;

-- Same tenant rule as metric_points: staff see all, clients their own.
drop policy if exists search_console_pages_read on search_console_pages;
create policy search_console_pages_read on search_console_pages
  for select using (is_staff() or client_id = auth_client_id());
-- Written by the sync (service role) only.
revoke insert, update, delete on search_console_pages from anon, authenticated;
