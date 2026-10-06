-- =====================================================================
-- Per-client AI tool access + staff audit log. Run after 0033. Idempotent.
-- =====================================================================

-- 1) client_tools: 0001's tenant_write let a CLIENT insert/update its own
--    rows, i.e. unlock tools for itself. Access is a staff decision — clients
--    may read their own rows (so the AI tools page can grey tools out) but
--    never write them.
--    Semantics: no row = tool available (existing clients keep every tool);
--    a row with is_unlocked = false switches the tool off for that client.
drop policy if exists tenant_write on client_tools;
drop policy if exists client_tools_write on client_tools;
create policy client_tools_write on client_tools for all
  using (is_staff()) with check (is_staff());

-- 2) audit_log: who did what, for staff accountability (GDPR Art. 5(2)).
--    Append-only: written by the service role from API routes, readable by
--    staff only, never editable from a browser session.
create table if not exists audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references users (id) on delete set null,
  actor_name  text,
  action      text not null check (char_length(action) between 1 and 60),
  client_id   uuid references clients (id) on delete set null,
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id   text check (target_id is null or char_length(target_id) <= 80),
  summary     text check (summary is null or char_length(summary) <= 300),
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_log_recent on audit_log (created_at desc);
create index if not exists idx_audit_log_client on audit_log (client_id, created_at desc);

alter table audit_log enable row level security;
drop policy if exists audit_log_read on audit_log;
create policy audit_log_read on audit_log for select using (is_staff());
revoke insert, update, delete on audit_log from anon, authenticated;
