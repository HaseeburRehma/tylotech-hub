-- =====================================================================
-- Lock down message UPDATEs. Run after 0032. Idempotent.
--
-- messages_update (0017) lets a sender update their own row, but RLS can't
-- restrict WHICH columns change. A user calling PostgREST directly could move
-- their message into another tenant (client_id), re-address a DM
-- (recipient_id), point attachment_path at someone else's file, or rewrite the
-- denormalized sender_name/sender_role. Only the edit columns (content,
-- translation, edited_at) may change from a browser session; everything else
-- is reserved for the service role / internal triggers.
-- =====================================================================

create or replace function guard_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service-role writes and security-definer triggers (reply counters) run as
  -- a privileged role; only plain browser sessions are restricted.
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

drop trigger if exists messages_update_guard on messages;
create trigger messages_update_guard
  before update on messages
  for each row execute function guard_message_update();
