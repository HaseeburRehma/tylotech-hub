-- =====================================================================
-- Fix: direct-message read leak.
-- 0011 created messages_write as FOR ALL. A FOR ALL policy's USING clause
-- ALSO applies to SELECT and is OR'd with messages_read, so `is_staff()`
-- re-opened read access to EVERY direct message for all staff.
-- Replace it with an INSERT-only policy so SELECT is governed solely by the
-- DM-aware messages_read policy. Run after 0011. Idempotent.
-- =====================================================================

drop policy if exists messages_write on messages;
drop policy if exists messages_insert on messages;

create policy messages_insert on messages for insert
  with check (is_staff() or client_id = auth_client_id());
