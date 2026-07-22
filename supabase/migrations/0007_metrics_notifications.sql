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
