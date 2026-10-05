-- =====================================================================
-- Security hardening 4. Run after 0025. Idempotent.
-- =====================================================================

-- 1) HIGH: integrations_write (0003) still let a client-role user INSERT/UPDATE
--    its own integration rows directly via PostgREST. An unfiltered UPDATE needs
--    no SELECT privilege, so a client could rewrite `meta` (accountId / siteUrl /
--    propertyId) on a row holding a staff-issued token and have the next sync
--    pull another tenant's account data. Every legitimate write goes through the
--    API with the service role, so lock browser-role writes down entirely.
drop policy if exists integrations_write on integrations;
create policy integrations_write on integrations for all using (is_staff()) with check (is_staff());
revoke insert, update, delete on public.integrations from anon, authenticated;

-- 2) Track who uploaded a document so clients can remove their own uploads
--    (but never staff-issued contracts, invoices or reports).
alter table public.documents add column if not exists uploaded_by uuid references public.users (id) on delete set null;
