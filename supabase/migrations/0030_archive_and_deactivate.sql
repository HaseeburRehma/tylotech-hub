-- =====================================================================
-- Archive clients (soft delete) and deactivate staff accounts.
-- Run after 0029. Idempotent.
-- =====================================================================
alter table public.clients add column if not exists archived_at timestamptz;
alter table public.users add column if not exists deactivated_at timestamptz;
create index if not exists idx_clients_active on public.clients (archived_at) where archived_at is null;
