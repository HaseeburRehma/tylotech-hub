-- =====================================================================
-- Slack-style threads, reactions, and mentions. Run after 0022. Idempotent.
--
-- Threads: any message can be a "parent". Replies reference parent_id.
--   parent_id IS NULL → top-level message (as before).
--   parent_id = <msg> → a reply in that message's thread.
--
-- Reactions: emoji reactions on messages. One per user+emoji pair.
--
-- Mentions: @mention tracking for unread badges and notifications.
-- =====================================================================

-- 1. Thread support: parent_id on messages
alter table public.messages add column if not exists parent_id uuid references messages (id) on delete cascade;
alter table public.messages add column if not exists reply_count integer not null default 0;
alter table public.messages add column if not exists last_reply_at timestamptz;

create index if not exists idx_messages_parent on messages (parent_id, created_at) where parent_id is not null;

-- 2. Reactions table
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_reactions_message on reactions (message_id);

-- RLS for reactions: same visibility as the message
alter table reactions enable row level security;

create policy reactions_read on reactions for select using (
  exists (
    select 1 from messages m where m.id = reactions.message_id
    and (
      (m.recipient_id is null or m.sender_id = auth.uid() or m.recipient_id = auth.uid())
      and (is_staff() or m.client_id = auth_client_id())
    )
  )
);

create policy reactions_insert on reactions for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from messages m where m.id = reactions.message_id
    and (
      (m.recipient_id is null or m.sender_id = auth.uid() or m.recipient_id = auth.uid())
      and (is_staff() or m.client_id = auth_client_id())
    )
  )
);

create policy reactions_delete on reactions for delete using (
  user_id = auth.uid()
);

-- 3. Mentions table: tracks who was @mentioned in which message
create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists idx_mentions_user on mentions (user_id, created_at);

alter table mentions enable row level security;

create policy mentions_read on mentions for select using (
  user_id = auth.uid() or is_staff()
);

create policy mentions_insert on mentions for insert with check (
  exists (
    select 1 from messages m where m.id = mentions.message_id and m.sender_id = auth.uid()
  )
);

-- Enable realtime on reactions
do $$ begin
  alter publication supabase_realtime add table reactions;
exception when duplicate_object then null; when undefined_object then null; end $$;
