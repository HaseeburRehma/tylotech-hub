-- TyloTech Hub — core schema with multi-tenant Row Level Security
-- Run in the Supabase SQL editor (or via the CLI) on a fresh project.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'team', 'client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('planning', 'in_progress', 'review', 'done', 'blocked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  company text not null,
  logo_url text,
  primary_color text not null default '#C9A84C',
  secondary_color text not null default '#0A0A0A',
  plan text not null default 'Starter',
  mrr integer not null default 0,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users; role + tenant live here.
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid references clients (id) on delete cascade,
  email text not null,
  name text not null,
  role user_role not null default 'client',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  status project_status not null default 'planning',
  progress integer not null default 0,
  assigned_to text,
  due date,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  sender_id uuid not null references users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists updates (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'note',
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  file_url text not null,
  type text not null default 'report',
  size text,
  created_at timestamptz not null default now()
);

create table if not exists kpis (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  metric_name text not null,
  label text not null,
  value numeric not null,
  unit text not null default 'number',
  delta numeric not null default 0,
  period text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists ai_tools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  prompt_template text,
  category text,
  is_active boolean not null default true
);

create table if not exists client_tools (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients (id) on delete cascade,
  tool_id uuid not null references ai_tools (id) on delete cascade,
  is_unlocked boolean not null default false,
  unique (client_id, tool_id)
);

create index if not exists idx_projects_client on projects (client_id);
create index if not exists idx_messages_client on messages (client_id, created_at);
create index if not exists idx_updates_client on updates (client_id, created_at desc);
create index if not exists idx_documents_client on documents (client_id);
create index if not exists idx_kpis_client on kpis (client_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer to avoid RLS recursion on `users`)
-- ---------------------------------------------------------------------------
create or replace function auth_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from users where id = auth.uid();
$$;

create or replace function auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('admin', 'team'), false);
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — client A can never see client B's data
-- ---------------------------------------------------------------------------
alter table clients enable row level security;
alter table users enable row level security;
alter table projects enable row level security;
alter table messages enable row level security;
alter table updates enable row level security;
alter table documents enable row level security;
alter table kpis enable row level security;
alter table ai_tools enable row level security;
alter table client_tools enable row level security;

-- Generic per-tenant read policy: staff see everything, clients see only their tenant.
do $$
declare t text;
begin
  foreach t in array array['projects','messages','updates','documents','kpis','client_tools']
  loop
    execute format('drop policy if exists tenant_read on %I;', t);
    execute format(
      'create policy tenant_read on %I for select using (is_staff() or client_id = auth_client_id());', t);
    execute format('drop policy if exists tenant_write on %I;', t);
    execute format(
      'create policy tenant_write on %I for all using (is_staff() or client_id = auth_client_id()) with check (is_staff() or client_id = auth_client_id());', t);
  end loop;
end $$;

drop policy if exists clients_read on clients;
create policy clients_read on clients for select
  using (is_staff() or id = auth_client_id());

drop policy if exists clients_write on clients;
create policy clients_write on clients for all
  using (is_staff()) with check (is_staff());

drop policy if exists users_read on users;
create policy users_read on users for select
  using (is_staff() or client_id = auth_client_id() or id = auth.uid());

drop policy if exists ai_tools_read on ai_tools;
create policy ai_tools_read on ai_tools for select using (true);

drop policy if exists ai_tools_write on ai_tools;
create policy ai_tools_write on ai_tools for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
