-- =====================================================================
-- Security hardening. Run after 0012. Idempotent.
-- =====================================================================

-- 1) OAuth tokens (and the whole integrations row) must never be read directly by
--    the browser role. RLS is row-level, so a client could otherwise SELECT its
--    own integration's access_token/refresh_token via PostgREST. Revoke direct
--    SELECT entirely — the app reads integrations server-side with the service
--    role (tenant ownership enforced in code) and never sends tokens to the client.
revoke select on public.integrations from anon, authenticated;

-- 2) KPIs and time-series are system/staff-written only. Clients read their own
--    (tenant_read / metric_points_read stay) but cannot fabricate dashboard data.
--    The sync route writes them with the service role, so this doesn't break syncs.
drop policy if exists tenant_write on kpis;
drop policy if exists kpis_write on kpis;
create policy kpis_write on kpis for all using (is_staff()) with check (is_staff());

drop policy if exists metric_points_write on metric_points;
create policy metric_points_write on metric_points for all using (is_staff()) with check (is_staff());
