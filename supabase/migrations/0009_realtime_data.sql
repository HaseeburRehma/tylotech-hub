-- =====================================================================
-- Realtime for dashboard data.
-- Lets a client's dashboard update live when an admin edits KPIs, syncs an
-- integration, or posts an update/project. Run after 0001–0008. Idempotent.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['kpis','metric_points','updates','projects'] loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then null; when undefined_object then null; end;
  end loop;
end $$;
