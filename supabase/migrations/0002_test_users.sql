-- =====================================================================
-- TyloTech Hub — test accounts for every role
-- Run this in the Supabase SQL editor AFTER 0001_init.sql.
-- It creates a reusable helper, then seeds one user per role.
-- =====================================================================

-- pgcrypto ships in the `extensions` schema on Supabase.
create extension if not exists pgcrypto with schema extensions;

-- Make sure the demo clients exist (idempotent — safe if seed.sql already ran).
insert into clients (id, name, company, primary_color, secondary_color, plan, mrr) values
  ('11111111-1111-1111-1111-111111111111', 'Nordic Estate',   'Nordic Estate',   '#38BDF8', '#0C141C', 'Scale',  6800),
  ('22222222-2222-2222-2222-222222222222', 'Velform Fitness', 'Velform Fitness', '#F43F5E', '#1A0E12', 'Growth', 4200),
  ('33333333-3333-3333-3333-333333333333', 'Altan Legal',     'Altan Legal',     '#34D399', '#0E1714', 'Enterprise', 9500)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- create_test_user(): provisions a fully-working email/password account.
-- Writes auth.users + auth.identities (so login works) and the matching
-- public.users profile row (role + tenant). Idempotent per email.
-- ---------------------------------------------------------------------
create or replace function create_test_user(
  p_email     text,
  p_password  text,
  p_name      text,
  p_role      user_role,
  p_client_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = auth, public, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  -- Idempotent: wipe any prior account with this email (cascades to identities + profile).
  delete from auth.users where email = p_email;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'role', p_role),
    '', '', '', ''
  );

  -- Required for password sign-in in current GoTrue versions.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- Application profile: role + tenant. RLS keys off this row.
  insert into public.users (id, client_id, email, name, role)
  values (v_user_id, p_client_id, p_email, p_name, p_role)
  on conflict (id) do update
    set client_id = excluded.client_id,
        email     = excluded.email,
        name      = excluded.name,
        role      = excluded.role;

  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Seed one account per role. Change the passwords before any real use.
-- ---------------------------------------------------------------------
select create_test_user('admin@tylotech.de',        'Admin123!',  'Ilias El Aradi', 'admin',  null);
select create_test_user('team@tylotech.de',         'Team123!',   'Sofia Lind',     'team',   null);
select create_test_user('marcus@nordicestate.com',  'Client123!', 'Marcus Holt',    'client', '11111111-1111-1111-1111-111111111111');
select create_test_user('lena@velform.com',         'Client123!', 'Lena Vance',     'client', '22222222-2222-2222-2222-222222222222');

-- Verify:
-- select u.email, u.role, c.company
-- from public.users u left join public.clients c on c.id = u.client_id
-- order by u.role;
