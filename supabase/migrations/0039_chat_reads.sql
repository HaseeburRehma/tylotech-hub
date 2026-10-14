-- =====================================================================
-- Read receipts ("Gesehen") for chat. Run after 0038. Idempotent.
--
-- One row per person and conversation with the time they last had it open.
-- A message counts as seen by everyone whose last_read_at >= its created_at.
-- conv_key:  c:<client_id>  client group chat
--            team           internal team chat
--            dm:<a>:<b>     direct messages (user ids sorted)
-- =====================================================================

create table if not exists public.chat_reads (
  user_id      uuid not null references users (id) on delete cascade,
  conv_key     text not null check (char_length(conv_key) <= 120),
  client_id    uuid references clients (id) on delete cascade,   -- tenant of the conversation (null = internal)
  last_read_at timestamptz not null default now(),
  primary key (user_id, conv_key)
);

create index if not exists idx_chat_reads_conv on chat_reads (conv_key);

alter table chat_reads enable row level security;

-- Read: staff see all; clients see their own tenant's conversations, and of
-- DMs only the ones they take part in.
drop policy if exists chat_reads_read on chat_reads;
create policy chat_reads_read on chat_reads for select using (
  is_staff()
  or (
    client_id is not null
    and client_id = auth_client_id()
    and (conv_key not like 'dm:%' or position(auth.uid()::text in conv_key) > 0)
  )
);

-- Write: only your own row, only in a conversation you belong to.
drop policy if exists chat_reads_insert on chat_reads;
create policy chat_reads_insert on chat_reads for insert with check (
  user_id = auth.uid()
  and (is_staff() or (client_id is not null and client_id = auth_client_id()))
  and (conv_key not like 'dm:%' or position(auth.uid()::text in conv_key) > 0)
);

drop policy if exists chat_reads_update on chat_reads;
create policy chat_reads_update on chat_reads for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (is_staff() or (client_id is not null and client_id = auth_client_id()))
  and (conv_key not like 'dm:%' or position(auth.uid()::text in conv_key) > 0)
);

revoke delete on chat_reads from anon, authenticated;

-- Live "Gesehen" updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table chat_reads;
  end if;
end $$;
