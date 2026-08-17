-- =====================================================================
-- Chat file sharing: PDFs, images, audio, video attached to messages.
-- Run after 0015. Idempotent.
-- =====================================================================

-- Attachment-only messages have no text.
alter table public.messages alter column content drop not null;

alter table public.messages
  add column if not exists attachment_path text,   -- storage path (server-only, never sent to browser)
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

-- Private bucket for chat attachments. Access is gated server-side: the download
-- route checks the message is readable (messages RLS = conversation participants)
-- before signing a URL, so files inherit the same privacy as the message.
insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do nothing;
