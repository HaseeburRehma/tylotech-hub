-- =====================================================================
-- Audit fixes (2026-10-08). Run after 0036. Idempotent.
-- =====================================================================

-- 1) Chat attachments: attachment_path is only ever set by the upload API
--    (service role). A browser session inserting a message could otherwise
--    point it at another file and have the server delete that file later.
create or replace function guard_message_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_mime := null;
    new.attachment_size := null;
    new.reply_count := 0;
    new.last_reply_at := null;
    new.edited_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_insert_guard on messages;
create trigger messages_insert_guard
  before insert on messages
  for each row execute function guard_message_insert();

-- 2) AI tools: the system prompts are agency IP. The table was readable by
--    anyone holding the public anon key (USING true). Signed-in users may read
--    the tool list; the prompt text itself is server-side only.
drop policy if exists ai_tools_read on ai_tools;
create policy ai_tools_read on ai_tools for select using (auth.uid() is not null);
revoke select on ai_tools from anon, authenticated;
grant select (id, name, slug, description, category, is_active, updated_at, updated_by) on ai_tools to authenticated;

-- 3) Workflow dates follow the Berlin calendar day (the team's day), not UTC.
create or replace function workflow_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create or replace function workflow_advance(p_step uuid, p_actor uuid, p_status text)
returns table (next_step_id uuid, run_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run  uuid;
  v_idx  int;
  v_next uuid;
  v_off  int;
begin
  if p_status not in ('done', 'skipped') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  select run_id, order_index into v_run, v_idx from workflow_run_steps where id = p_step;
  if v_run is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;

  perform 1 from workflow_runs where id = v_run and status = 'active' for update;
  if not found then
    raise exception 'run is not active' using errcode = '55000';
  end if;

  update workflow_run_steps
     set status = p_status, completed_by = p_actor, completed_at = now()
   where id = p_step and status = 'active';
  if not found then
    raise exception 'step is not active' using errcode = '55000';
  end if;

  select id, due_offset_days into v_next, v_off
    from workflow_run_steps
   where run_id = v_run and status = 'locked' and order_index > v_idx
   order by order_index
   limit 1;

  if v_next is null then
    update workflow_runs set status = 'completed', completed_at = now() where id = v_run;
    return query select null::uuid, true;
  else
    update workflow_run_steps
       set status = 'active',
           activated_at = now(),
           due_date = coalesce(due_date, case when v_off is null then null else workflow_today() + v_off end)
     where id = v_next;
    return query select v_next, false;
  end if;
end;
$$;

-- Reopen: later steps are re-locked AND lose the deadlines they got when they
-- were activated (otherwise they'd be overdue the moment they activate again);
-- the reopened step gets a fresh deadline from its offset.
create or replace function workflow_reopen(p_step uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
  v_idx int;
begin
  select run_id, order_index into v_run, v_idx from workflow_run_steps where id = p_step and status in ('done', 'skipped');
  if v_run is null then
    raise exception 'step is not finished' using errcode = '55000';
  end if;
  perform 1 from workflow_runs where id = v_run for update;

  update workflow_run_steps
     set status = 'locked', activated_at = null, completed_by = null, completed_at = null, due_date = null
   where run_id = v_run and order_index > v_idx and status <> 'locked';
  update workflow_run_steps
     set status = 'active', activated_at = now(), completed_by = null, completed_at = null,
         due_date = case when due_offset_days is null then null else workflow_today() + due_offset_days end
   where id = p_step;
  update workflow_runs set status = 'active', completed_at = null where id = v_run and status = 'completed';
end;
$$;

-- 4) Replace a template's steps atomically (a failed insert must not leave
--    the template with zero steps).
create or replace function workflow_replace_template_steps(p_template uuid, p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from workflow_template_steps where template_id = p_template;
  insert into workflow_template_steps (template_id, order_index, title, instructions, default_assignee_role, default_assignee_user_id, due_offset_days)
  select p_template,
         (s->>'order_index')::int,
         s->>'title',
         nullif(s->>'instructions', ''),
         nullif(s->>'default_assignee_role', ''),
         nullif(s->>'default_assignee_user_id', '')::uuid,
         (s->>'due_offset_days')::int
    from jsonb_array_elements(p_steps) s;
end;
$$;

revoke all on function workflow_advance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function workflow_reopen(uuid) from public, anon, authenticated;
revoke all on function workflow_replace_template_steps(uuid, jsonb) from public, anon, authenticated;
