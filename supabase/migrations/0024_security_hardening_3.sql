-- =====================================================================
-- Security hardening pass 3 — full-app audit findings.
-- Run this in the Supabase SQL editor immediately; item 1 is a live,
-- unauthenticated remote-admin-takeover backdoor. Idempotent.
-- =====================================================================

-- 1) CRITICAL: drop the test-user provisioning helper from 0002. It's a
--    `security definer` function that deletes+recreates any auth.users row
--    (email/password/role/tenant, attacker-chosen) and was never revoked or
--    dropped. Postgres grants EXECUTE to PUBLIC by default on function
--    creation, and PostgREST/Supabase exposes public-schema functions as RPC
--    to anon/authenticated by default — so ANY caller with just the public
--    anon key could POST /rest/v1/rpc/create_test_user with
--    {"p_email":"<real admin email>","p_password":"<attacker's>","p_role":"admin",...}
--    and take over that account with no authentication at all. No app code
--    references this function (grep confirmed) — safe to drop outright.
drop function if exists create_test_user(text, text, text, user_role, uuid);

-- 2) HIGH: `documents` never got the staff-only write lockdown that
--    `kpis`/`metric_points` (0013) and `updates`/`projects` (0020) already
--    have — it was still on 0001's generic tenant_write, so a client-role
--    user could set an arbitrary `file_url` on their own document row via
--    direct PostgREST, which /api/documents/download then blindly
--    redirects to (open redirect from a trusted domain), plus forge/delete
--    their own contract/invoice records.
drop policy if exists tenant_write on documents;
drop policy if exists documents_write on documents;
create policy documents_write on documents for all using (is_staff()) with check (is_staff());

-- 3) MEDIUM: messages_insert (0019) pins sender_id to auth.uid() but never
--    validated the denormalized sender_name/sender_role display columns, so
--    a client-role user could insert a message in their own tenant thread
--    with sender_name/sender_role spoofed to look like TyloTech staff.
--    Force these two columns from the real profile row on every insert.
create or replace function sync_message_sender_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select name, role::text into new.sender_name, new.sender_role
  from users where id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists messages_sender_meta on messages;
create trigger messages_sender_meta
  before insert on messages
  for each row execute function sync_message_sender_meta();

-- 4) LOW: mentions_insert (0023) only checked that the caller authored the
--    message, not that the mentioned user has any relationship to that
--    message's tenant — a client could @mention an arbitrary user_id from
--    another tenant, generating a cross-tenant notification. Require the
--    mentioned user to be staff or share the message's client_id.
drop policy if exists mentions_insert on mentions;
create policy mentions_insert on mentions for insert with check (
  exists (
    select 1 from messages m
    join users u on u.id = mentions.user_id
    where m.id = mentions.message_id
      and m.sender_id = auth.uid()
      and (u.role in ('admin', 'team') or u.client_id = m.client_id)
  )
);
