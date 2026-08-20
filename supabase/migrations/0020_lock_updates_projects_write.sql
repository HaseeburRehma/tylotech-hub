-- =====================================================================
-- Dashboard `updates` and `projects` are staff-authored — clients should not be
-- able to fabricate their own via direct PostgREST. 0013 locked kpis/metric_points
-- the same way but left these two on the generic tenant_write policy. Clients keep
-- READ access through tenant_read (FOR SELECT); only writes become staff-only.
-- Run after 0019. Idempotent.
-- =====================================================================

drop policy if exists tenant_write on updates;
drop policy if exists updates_write on updates;
create policy updates_write on updates for all using (is_staff()) with check (is_staff());

drop policy if exists tenant_write on projects;
drop policy if exists projects_write on projects;
create policy projects_write on projects for all using (is_staff()) with check (is_staff());
