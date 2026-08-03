-- =====================================================================
-- Direct messages: 1:1 threads alongside the tenant group thread.
-- Run after 0001–0010. Idempotent.
--
-- Model:
--   recipient_id IS NULL  -> group thread (whole tenant + all staff)
--   recipient_id = <user> -> direct message, visible only to the two
--                            participants (sender + recipient).
-- =====================================================================

alter table messages
  add column if not exists recipient_id uuid references users (id) on delete cascade;

create index if not exists idx_messages_recipient
  on messages (client_id, recipient_id, created_at);

-- Replace the generic tenant policy on `messages` with a DM-aware one.
-- Group messages (recipient_id null) follow tenant/staff visibility.
-- Direct messages are visible ONLY to the sender and the recipient.
drop policy if exists tenant_read on messages;
drop policy if exists tenant_write on messages;
drop policy if exists messages_read on messages;
drop policy if exists messages_write on messages;

create policy messages_read on messages for select using (
  (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid())
  and (is_staff() or client_id = auth_client_id())
);

-- INSERT-only (never FOR ALL): a FOR ALL policy's USING clause also governs
-- SELECT and would OR `is_staff()` back into read access, leaking every DM to
-- all staff. The app only ever inserts messages, so INSERT is all we need.
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (is_staff() or client_id = auth_client_id());
