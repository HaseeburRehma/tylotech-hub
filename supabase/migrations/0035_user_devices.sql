-- =====================================================================
-- Push-notification devices for the TyloHQ mobile app. Run after 0034.
-- Idempotent.
--
-- One row per Expo push token. A user may only see, add and remove their
-- own devices; the server (service role) reads tokens to fan out pushes.
-- =====================================================================

create table if not exists user_devices (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users (id) on delete cascade,
  expo_token   text not null unique check (expo_token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_user_devices_user on user_devices (user_id);

alter table user_devices enable row level security;

drop policy if exists user_devices_select on user_devices;
create policy user_devices_select on user_devices for select using (user_id = auth.uid());

-- No direct INSERT/UPDATE: registration goes through register_device() below.
drop policy if exists user_devices_insert on user_devices;
drop policy if exists user_devices_update on user_devices;
revoke insert, update on user_devices from anon, authenticated;

drop policy if exists user_devices_delete on user_devices;
create policy user_devices_delete on user_devices for delete using (user_id = auth.uid());

-- Register this phone's token for the signed-in user. Holding the token proves
-- you hold the device, so a token left behind by a previous user on the same
-- phone is moved to the caller (never to anyone else).
create or replace function register_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into user_devices (user_id, expo_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

revoke all on function register_device(text, text) from public, anon;
grant execute on function register_device(text, text) to authenticated;
