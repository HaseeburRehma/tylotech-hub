-- =====================================================================
-- Internal staff chat: messages with a NULL client_id live in the
-- staff-only "TyloTech Team" workspace (group + 1:1 between colleagues).
-- Existing messages_read/messages_insert policies already handle NULL
-- client_id correctly (is_staff() gates it; clients can't match a NULL
-- tenant), so only the column needs to allow NULL. Run after 0014.
-- =====================================================================
alter table public.messages alter column client_id drop not null;

create index if not exists idx_messages_internal
  on public.messages (recipient_id, created_at) where client_id is null;
