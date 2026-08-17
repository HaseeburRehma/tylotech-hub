-- =====================================================================
-- Editable / deletable chat messages. Run after 0016. Idempotent.
--
-- Users may edit and delete ONLY their own messages (sender_id = auth.uid()).
-- REPLICA IDENTITY FULL so UPDATE/DELETE realtime events carry all columns
-- (needed for the client-side tenant filter + removing the right message).
-- =====================================================================

alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages replica identity full;

drop policy if exists messages_update on messages;
create policy messages_update on messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete
  using (sender_id = auth.uid());
