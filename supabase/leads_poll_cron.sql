-- =====================================================================
-- Lead poll: every 20 seconds (Meta pages once a minute, Google Sheets each tick).
--
-- While the TyloTech Hub Meta app is "Unpublished", Meta delivers no real
-- webhooks, and Vercel's Hobby cron only runs once a day — so new leads would
-- reach TyloHQ hours late. This job calls /api/leads/meta/poll every 20 seconds;
-- new leads get the normal alerts (email, urgent push, 60-second screen).
-- Leads already delivered by the webhook or the daily sync never alert twice.
--
-- Run in the Supabase SQL editor. Re-runnable. Replace <CRON_SECRET> with the
-- value of CRON_SECRET from Vercel (tylotech-hub/.env.local has the same) — or
-- use supabase/leads_poll_cron.local.sql, which already has it filled in and is
-- git-ignored. The secret is kept in Supabase Vault, not in the job text.
--
-- Stop it later (e.g. once the Meta app is published and webhooks arrive):
--   select cron.unschedule('tylohq-meta-leads-poll');
-- Check it:
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'tylohq-meta-leads-poll')
--    order by start_time desc limit 5;
--   select status_code, left(content::text, 120), created from net._http_response order by created desc limit 5;
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The bearer token, stored encrypted in Vault (create or replace).
do $$
declare
  v_secret text := '<CRON_SECRET>';
  v_id uuid;
begin
  if v_secret = '<CRON_SECRET>' or length(v_secret) < 16 then
    raise exception 'Put the CRON_SECRET value in place of <CRON_SECRET> first.';
  end if;
  select id into v_id from vault.secrets where name = 'tylohq_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'tylohq_cron_secret', 'Bearer token for tylohq.de cron endpoints');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;

-- (Re)schedule: every 20 seconds (sheets each tick, each Meta page once a
-- minute; the endpoint paces itself). Needs pg_cron 1.5+ (Supabase has it).
select cron.unschedule(jobid) from cron.job where jobname = 'tylohq-meta-leads-poll';
select cron.schedule(
  'tylohq-meta-leads-poll',
  '20 seconds',
  $job$
  select net.http_post(
    url := 'https://www.tylohq.de/api/leads/meta/poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tylohq_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
