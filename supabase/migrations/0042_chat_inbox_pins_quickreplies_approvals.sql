-- =====================================================================
-- Chat inbox, response alerts, pinned messages, quick replies, client
-- approvals and message search. Run after 0041. Idempotent.
--
-- 1) chat_inbox(): per partner for the signed-in team member — unread client
--    messages (since they last had the chat open) and since when the partner
--    has been waiting for a reply.
-- 2) Response alerts: every 15 minutes (pg_cron), partners waiting > 3 hours
--    during working hours (Mon–Fri 08–18 Berlin) notify the whole team, once
--    per waiting episode.
-- 3) Pinned messages (messages.pinned_at / pinned_by) — set via the API only.
-- 4) Quick replies — the team's shared "/shortcut" answers.
-- 5) Client approvals on process steps (draft → approve / request changes).
-- 6) Trigram index for message search.
-- =====================================================================

-- ---------------------------------------------------------------- 1) inbox
create or replace function public.chat_inbox()
returns table (client_id uuid, unread int, waiting_since timestamptz, last_message_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if not is_staff() then
    return;
  end if;
  return query
  with c as (
    select cl.id from clients cl where cl.archived_at is null
  ),
  reads as (
    select r.conv_key, r.last_read_at from chat_reads r where r.user_id = me
  ),
  last_staff as (
    select m.client_id, max(m.created_at) as at
    from messages m
    where m.client_id is not null and m.sender_role in ('admin', 'team')
    group by m.client_id
  )
  select
    c.id,
    (
      select count(*)::int from messages m
      where m.client_id = c.id
        and m.sender_role = 'client'
        and (
          (m.recipient_id is null and m.created_at > coalesce((select last_read_at from reads where conv_key = 'c:' || c.id), '-infinity'))
          or (m.recipient_id = me and m.created_at > coalesce((
                select last_read_at from reads
                where conv_key = 'dm:' || least(me::text collate "C", m.sender_id::text collate "C") || ':' || greatest(me::text collate "C", m.sender_id::text collate "C")
              ), '-infinity'))
        )
    ),
    (
      select min(m.created_at) from messages m
      where m.client_id = c.id
        and m.sender_role = 'client'
        and m.created_at > coalesce((select ls.at from last_staff ls where ls.client_id = c.id), '-infinity')
    ),
    (select max(m.created_at) from messages m where m.client_id = c.id)
  from c;
end;
$$;

revoke all on function public.chat_inbox() from public, anon;
grant execute on function public.chat_inbox() to authenticated;

create index if not exists idx_messages_client_created on messages (client_id, created_at desc);

-- ------------------------------------------------------- 2) response alerts
create table if not exists public.chat_response_alerts (
  client_id     uuid not null references clients (id) on delete cascade,
  waiting_since timestamptz not null,
  alerted_at    timestamptz not null default now(),
  primary key (client_id, waiting_since)
);
alter table chat_response_alerts enable row level security;
revoke all on chat_response_alerts from anon, authenticated;

create or replace function public.chat_response_alerts_run(p_hours numeric default 3)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  berlin timestamp := now() at time zone 'Europe/Berlin';
  rec record;
  n int := 0;
begin
  -- Working hours only: Mon–Fri, 08:00–18:00 Berlin.
  if extract(isodow from berlin) > 5 or berlin::time < time '08:00' or berlin::time >= time '18:00' then
    return 0;
  end if;

  for rec in
    with last_staff as (
      select m.client_id, max(m.created_at) as at
      from messages m
      where m.client_id is not null and m.sender_role in ('admin', 'team')
      group by m.client_id
    ),
    waiting as (
      select m.client_id, min(m.created_at) as since
      from messages m
      left join last_staff ls on ls.client_id = m.client_id
      where m.client_id is not null
        and m.sender_role = 'client'
        and m.created_at > coalesce(ls.at, '-infinity')
      group by m.client_id
    )
    select w.client_id, w.since, cl.company, coalesce(cl.slug, cl.id::text) as path
    from waiting w
    join clients cl on cl.id = w.client_id and cl.archived_at is null
    where w.since < now() - make_interval(secs => p_hours * 3600)
  loop
    insert into chat_response_alerts (client_id, waiting_since) values (rec.client_id, rec.since)
    on conflict do nothing;
    if found then
      n := n + 1;
      insert into notifications (user_id, title, body, href, type)
      select u.id,
             'Wartet auf Antwort: ' || rec.company,
             'Seit ' || to_char(rec.since at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') || ' Uhr ohne Antwort vom Team.',
             '/internal/clients/' || rec.path || '?tab=chat',
             'message'
      from users u
      where u.role in ('admin', 'team') and u.deactivated_at is null;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.chat_response_alerts_run(numeric) from public, anon, authenticated;

-- Schedule it when pg_cron is available (Database → Extensions → pg_cron).
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'chat-response-alerts') then
    perform cron.unschedule('chat-response-alerts');
  end if;
  perform cron.schedule('chat-response-alerts', '*/15 * * * *', 'select public.chat_response_alerts_run(3)');
exception when others then
  raise notice 'pg_cron not available (%): enable it under Database → Extensions, then run this block again.', sqlerrm;
end;
$$;

-- ------------------------------------------------------------- 3) pins
alter table messages add column if not exists pinned_at timestamptz;
alter table messages add column if not exists pinned_by uuid references users (id) on delete set null;
create index if not exists idx_messages_pinned on messages (client_id, pinned_at) where pinned_at is not null;

-- Browser sessions may only edit the text; pins go through the API.
create or replace function guard_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.sender_name is distinct from old.sender_name
     or new.sender_role is distinct from old.sender_role
     or new.client_id is distinct from old.client_id
     or new.recipient_id is distinct from old.recipient_id
     or new.parent_id is distinct from old.parent_id
     or new.reply_to_id is distinct from old.reply_to_id
     or new.reply_count is distinct from old.reply_count
     or new.last_reply_at is distinct from old.last_reply_at
     or new.attachment_path is distinct from old.attachment_path
     or new.attachment_name is distinct from old.attachment_name
     or new.attachment_mime is distinct from old.attachment_mime
     or new.attachment_size is distinct from old.attachment_size
     or new.pinned_at is distinct from old.pinned_at
     or new.pinned_by is distinct from old.pinned_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the message text can be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------ 4) quick replies
create table if not exists public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  shortcut   text not null unique check (shortcut ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  body       text not null check (char_length(body) between 1 and 4000),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table quick_replies enable row level security;
drop policy if exists quick_replies_staff on quick_replies;
create policy quick_replies_staff on quick_replies for all using (is_staff()) with check (is_staff());

-- ------------------------------------------------------- 5) approvals
create table if not exists public.workflow_approvals (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references workflow_runs (id) on delete cascade,
  step_id          uuid not null references workflow_run_steps (id) on delete cascade,
  client_id        uuid not null references clients (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  message          text check (message is null or char_length(message) <= 2000),
  attachment_ids   uuid[] not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'cancelled')),
  requested_by     uuid references users (id) on delete set null,
  requested_at     timestamptz not null default now(),
  decided_by       uuid references users (id) on delete set null,
  decided_at       timestamptz,
  decision_comment text check (decision_comment is null or char_length(decision_comment) <= 2000)
);
create index if not exists idx_wf_approvals_client on workflow_approvals (client_id, status, requested_at desc);
create index if not exists idx_wf_approvals_step on workflow_approvals (step_id);

alter table workflow_approvals enable row level security;
drop policy if exists wf_approvals_read on workflow_approvals;
create policy wf_approvals_read on workflow_approvals for select
  using (is_staff() or client_id = auth_client_id());
revoke insert, update, delete on workflow_approvals from anon, authenticated;

-- --------------------------------------------------------- 6) search
create extension if not exists pg_trgm;
create index if not exists idx_messages_content_trgm on messages using gin (content gin_trgm_ops);
