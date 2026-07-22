-- =====================================================================
-- Live chat (Realtime) + logo storage
-- Run after 0001–0004. Idempotent.
-- =====================================================================

-- Denormalize sender identity so clients can render team names without needing
-- read access to staff user rows (RLS keeps staff profiles private otherwise).
alter table messages add column if not exists sender_name text;
alter table messages add column if not exists sender_role text;

-- Enable Supabase Realtime on the messages table.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Public bucket for client logos (uploads happen server-side via the service role).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Seed a short conversation for the Nordic demo client.
delete from messages where client_id = '11111111-1111-1111-1111-111111111111';

insert into messages (client_id, sender_id, sender_name, sender_role, content, created_at)
select '11111111-1111-1111-1111-111111111111'::uuid,
       (select id from users where email = 'team@tylotech.de'),
       'Sofia Lind', 'team',
       'Morning Marcus! June numbers are in — 4.7x ROAS 🎉', now() - interval '58 minutes'
union all
select '11111111-1111-1111-1111-111111111111',
       (select id from users where email = 'marcus@nordicestate.com'),
       'Marcus Holt', 'client',
       'That is brilliant. Can we push more budget into the winning audiences?', now() - interval '52 minutes'
union all
select '11111111-1111-1111-1111-111111111111',
       (select id from users where email = 'team@tylotech.de'),
       'Sofia Lind', 'team',
       'Already on it — reallocating €3k today. Revised projection this afternoon.', now() - interval '47 minutes';
