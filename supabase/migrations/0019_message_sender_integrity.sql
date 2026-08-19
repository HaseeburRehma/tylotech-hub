-- =====================================================================
-- Harden message insert against sender spoofing.
-- 0012's messages_insert only checked the tenant (client_id), NOT that the
-- row's sender_id matches the authenticated user. Via direct PostgREST a
-- client could insert a message in their own tenant with sender_id / sender_role
-- set to a staff member's — forging a message that renders as "from TyloTech".
-- Pin sender_id to auth.uid() (same invariant 0017 uses for edit/delete), so a
-- forged sender is rejected at the database. Both API routes already set
-- sender_id = the authenticated user, so this is transparent to the app.
-- Run after 0018. Idempotent.
-- =====================================================================

drop policy if exists messages_insert on messages;

create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and (is_staff() or client_id = auth_client_id())
  );
