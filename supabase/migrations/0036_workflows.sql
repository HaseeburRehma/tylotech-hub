-- =====================================================================
-- Workflows ("Prozesse"): a generic, template-driven process engine.
-- Run after 0035. Idempotent.
--
--   workflow_templates / workflow_template_steps  — reusable definitions
--   workflow_runs / workflow_run_steps            — a template applied to a
--                                                   partner (or project)
--
-- Steps are COPIED into the run at start, so editing a template never changes
-- processes already running. v1 is strictly linear: exactly one step is
-- "active" at a time; checking it off activates the next one.
--
-- Staff-only feature: staff can read everything; every write goes through the
-- API (service role) so the engine rules + notifications + audit live in one
-- place. Advancing is done by workflow_advance() under a row lock, so a double
-- click or two people at once can't skip or double-advance a step.
-- =====================================================================

create table if not exists workflow_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  created_by  uuid references users (id) on delete set null,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists workflow_template_steps (
  id                       uuid primary key default uuid_generate_v4(),
  template_id              uuid not null references workflow_templates (id) on delete cascade,
  order_index              int not null check (order_index >= 0),
  title                    text not null check (char_length(title) between 1 and 160),
  instructions             text check (instructions is null or char_length(instructions) <= 4000),
  -- Matches a staff member's title (e.g. "SEO Expert") to pre-fill the assignee…
  default_assignee_role    text check (default_assignee_role is null or char_length(default_assignee_role) <= 80),
  -- …or a fixed default person (wins over the role).
  default_assignee_user_id uuid references users (id) on delete set null,
  due_offset_days          int check (due_offset_days is null or due_offset_days between 0 and 365),
  unique (template_id, order_index)
);

create table if not exists workflow_runs (
  id           uuid primary key default uuid_generate_v4(),
  template_id  uuid references workflow_templates (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 160),
  context_type text not null default 'partner' check (context_type in ('partner', 'project')),
  context_id   uuid not null,
  -- Denormalised for fast partner views and the board (a project's client too).
  client_id    uuid references clients (id) on delete cascade,
  status       text not null default 'active' check (status in ('active', 'completed', 'paused')),
  started_by   uuid references users (id) on delete set null,
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists workflow_run_steps (
  id               uuid primary key default uuid_generate_v4(),
  run_id           uuid not null references workflow_runs (id) on delete cascade,
  template_step_id uuid references workflow_template_steps (id) on delete set null,
  order_index      int not null,
  title            text not null check (char_length(title) between 1 and 160),
  instructions     text,
  assignee_user_id uuid references users (id) on delete set null,
  status           text not null default 'locked' check (status in ('locked', 'active', 'done', 'skipped')),
  due_offset_days  int,
  due_date         date,
  note             text check (note is null or char_length(note) <= 2000),
  activated_at     timestamptz,
  completed_by     uuid references users (id) on delete set null,
  completed_at     timestamptz,
  unique (run_id, order_index)
);

create index if not exists idx_wf_tsteps_template on workflow_template_steps (template_id, order_index);
create index if not exists idx_wf_runs_client on workflow_runs (client_id, started_at desc);
create index if not exists idx_wf_runs_status on workflow_runs (status);
create index if not exists idx_wf_rsteps_run on workflow_run_steps (run_id, order_index);
create index if not exists idx_wf_rsteps_assignee_active on workflow_run_steps (assignee_user_id) where status = 'active';
-- Linear engine invariant: at most one active step per run.
create unique index if not exists uq_wf_one_active_step on workflow_run_steps (run_id) where status = 'active';

alter table workflow_templates enable row level security;
alter table workflow_template_steps enable row level security;
alter table workflow_runs enable row level security;
alter table workflow_run_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workflow_templates', 'workflow_template_steps', 'workflow_runs', 'workflow_run_steps'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (is_staff())', t || '_read', t);
    execute format('revoke insert, update, delete on %I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- workflow_advance: finish the active step ('done' or 'skipped') and
-- activate the next one. Returns the newly active step (null when the run
-- just completed) so the caller can notify its assignee.
-- Permission checks (assignee vs admin) happen in the API before calling.
-- ---------------------------------------------------------------------
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

  -- Serialise all changes to this run.
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
           -- Keep a deadline someone already set by hand.
           due_date = coalesce(due_date, case when v_off is null then null else current_date + v_off end)
     where id = v_next;
    return query select v_next, false;
  end if;
end;
$$;

-- Reopen a finished step (admin): it becomes active again, every later step is
-- re-locked and its completion cleared; a completed run becomes active again.
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
     set status = 'locked', activated_at = null, completed_by = null, completed_at = null
   where run_id = v_run and order_index >= v_idx and status <> 'locked';
  update workflow_run_steps set status = 'active', activated_at = now() where id = p_step;
  update workflow_runs set status = 'active', completed_at = null where id = v_run and status = 'completed';
end;
$$;

revoke all on function workflow_advance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function workflow_reopen(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- First real process: SEO-Onboarding (content from the dev brief).
-- Only inserted once; editable afterwards in the Templates UI.
-- ---------------------------------------------------------------------
do $$
declare v_tpl uuid;
begin
  if not exists (select 1 from workflow_templates where name = 'SEO-Onboarding') then
    insert into workflow_templates (name, description)
    values ('SEO-Onboarding', 'Standardablauf, wenn ein neuer Partner mit SEO startet — von der Keyword-Recherche bis zum ersten Reporting.')
    returning id into v_tpl;

    insert into workflow_template_steps (template_id, order_index, title, instructions, default_assignee_role, due_offset_days) values
      (v_tpl, 0, 'Keyword-Recherche', 'Haupt- und Nebenkeywords für die wichtigsten Leistungen und Standorte des Partners recherchieren und priorisieren.', 'SEO Expert', 3),
      (v_tpl, 1, 'Onpage-Struktur geprüft', 'Seitenstruktur, Title/Meta, Überschriften und Indexierung prüfen; Lücken gegenüber den Keywords notieren.', 'SEO Expert', 3),
      (v_tpl, 2, 'Content erstellt & optimiert', 'Fehlende Seiten/Texte erstellen bzw. bestehende auf die priorisierten Keywords optimieren.', 'SEO Expert', 5),
      (v_tpl, 3, 'Interne Verlinkung & Technik', 'Interne Links setzen, Ladezeit, Mobile-Darstellung, Sitemap und strukturierte Daten prüfen.', 'SEO Expert', 3),
      (v_tpl, 4, 'Reporting an Partner senden', 'Ergebnisse und nächste Schritte zusammenfassen und an den Partner senden.', 'Founder / Strategy', 2);
  end if;
end $$;
