-- =====================================================================
-- Run after 0044. Idempotent.
--
-- 1) Atomic replace of a client's MANUAL KPIs. /api/kpis used to insert the
--    new set and delete the old rows in two round trips; two staff saving at
--    once could interleave and leave duplicate or missing KPIs. This function
--    does both in one transaction, serialised per client with an advisory lock.
--
-- 2) Several people per project (Figma "HQ · Projekte" shows stacked
--    assignees). assigned_to_id stays the lead (first) assignee and
--    assigned_to keeps the joined names, so older readers (mobile app,
--    dashboards) keep working.
-- =====================================================================

-- ------------------------------------------------------- 1) KPIs
create or replace function public.kpis_replace_manual(p_client uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('kpis_manual:' || p_client::text));

  delete from kpis where client_id = p_client and source = 'Manual';

  insert into kpis (client_id, metric_name, label, value, unit, delta, period, source)
  select p_client,
         r->>'metric_name',
         r->>'label',
         (r->>'value')::numeric,
         r->>'unit',
         nullif(r->>'delta', '')::numeric,
         nullif(r->>'period', ''),
         'Manual'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.kpis_replace_manual(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------- 2) project assignees
alter table public.projects add column if not exists assignee_ids uuid[] not null default '{}';

update public.projects
   set assignee_ids = array[assigned_to_id]
 where assigned_to_id is not null
   and cardinality(assignee_ids) = 0;

create index if not exists projects_assignee_ids_idx on public.projects using gin (assignee_ids);
