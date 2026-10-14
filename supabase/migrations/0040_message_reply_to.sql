-- =====================================================================
-- Quoted replies (WhatsApp-style). Run after 0039. Idempotent.
--
-- A reply stays in the main conversation and shows the message it answers
-- as a quote. Unlike threads (parent_id), it does not hide in a side panel.
-- The API checks the quoted message belongs to the same conversation.
-- =====================================================================

alter table messages add column if not exists reply_to_id uuid references messages (id) on delete set null;
create index if not exists idx_messages_reply_to on messages (reply_to_id) where reply_to_id is not null;

-- Same rule as every other structural field: browser sessions may only edit
-- the message text, never what a message replies to.
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
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the message text can be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;
