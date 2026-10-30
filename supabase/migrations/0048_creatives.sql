-- =====================================================================
-- Creatives: every social / ad creative made for a partner, filed per
-- project under "Creatives" in category folders (Social Media Design,
-- Social Media Videos, Ad Creatives, ...).
-- Run after 0047. Idempotent.
--
--   creative_folders  the categories inside a project's Creatives folder.
--   creative_sources  a Google Drive / Dropbox / OneDrive folder synced into
--                     a category. Holds refresh tokens, so API only.
--   creatives         one row per file: uploaded to the private `creatives`
--                     bucket, or a file in a connected cloud folder.
-- Reads: the team and the partner's own users (RLS). Writes go through the API.
-- =====================================================================

-- Monthly creative allowance per partner (the red line in "Creatives over time").
alter table public.clients add column if not exists creatives_monthly_limit int
  check (creatives_monthly_limit is null or creatives_monthly_limit between 1 and 100000);

create table if not exists public.creative_folders (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients (id) on delete cascade,
  project_id  uuid not null references projects (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  position    int not null default 0,
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_creative_folders_name on creative_folders (project_id, lower(btrim(name)));
create index if not exists idx_creative_folders_client on creative_folders (client_id);
alter table creative_folders enable row level security;
drop policy if exists creative_folders_read on creative_folders;
create policy creative_folders_read on creative_folders for select using (is_staff() or client_id = auth_client_id());
revoke insert, update, delete on creative_folders from anon, authenticated;

create table if not exists public.creative_sources (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients (id) on delete cascade,
  project_id     uuid not null references projects (id) on delete cascade,
  folder_id      uuid not null references creative_folders (id) on delete cascade,
  provider       text not null check (provider in ('google_drive', 'dropbox', 'onedrive')),
  external_id    text not null check (char_length(external_id) <= 2000),  -- Drive folder id, Dropbox link/path, OneDrive drive!item
  label          text not null check (char_length(label) between 1 and 200),
  account        text check (account is null or char_length(account) <= 320),
  access_token   text,                -- refresh token
  status         text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_error     text,
  last_synced_at timestamptz,
  config         jsonb not null default '{}'::jsonb,
  created_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (folder_id, provider, external_id)
);
create index if not exists idx_creative_sources_client on creative_sources (client_id);
alter table creative_sources enable row level security;
revoke all on creative_sources from anon, authenticated;

create table if not exists public.creatives (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  project_id    uuid not null references projects (id) on delete cascade,
  folder_id     uuid not null references creative_folders (id) on delete cascade,
  source        text not null default 'upload' check (source in ('upload', 'google_drive', 'dropbox', 'onedrive')),
  source_id     uuid references creative_sources (id) on delete cascade,
  external_id   text check (external_id is null or char_length(external_id) <= 2000),
  name          text not null check (char_length(name) between 1 and 255),
  kind          text not null check (kind in ('image', 'video', 'document')),
  mime          text check (mime is null or char_length(mime) <= 120),
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  width         int,
  height        int,
  duration_sec  numeric(10, 2),
  storage_path  text unique,          -- uploads: <client>/<project>/<folder>/<uuid>-<name>
  content_hash  text check (content_hash is null or char_length(content_hash) <= 200),
  external_url  text check (external_url is null or external_url ~ '^https://'),
  created_at    timestamptz not null default now(),   -- when the creative was made (the month it counts in)
  added_at      timestamptz not null default now(),
  uploaded_by   uuid references users (id) on delete set null,
  unique (source_id, external_id)     -- uploads have neither, so they never collide
);
create index if not exists idx_creatives_client_created on creatives (client_id, created_at desc);
create index if not exists idx_creatives_folder on creatives (folder_id, created_at desc);
create index if not exists idx_creatives_hash on creatives (client_id, content_hash) where content_hash is not null;
alter table creatives enable row level security;
drop policy if exists creatives_read on creatives;
create policy creatives_read on creatives for select using (is_staff() or client_id = auth_client_id());
revoke insert, update, delete on creatives from anon, authenticated;

-- Every project starts with the standard categories.
create or replace function public.creative_default_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into creative_folders (client_id, project_id, name, position)
  values (new.client_id, new.id, 'Social Media Design', 0),
         (new.client_id, new.id, 'Social Media Videos', 1),
         (new.client_id, new.id, 'Ad Creatives', 2)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_projects_creative_folders on projects;
create trigger trg_projects_creative_folders after insert on projects for each row execute function creative_default_folders();

insert into creative_folders (client_id, project_id, name, position)
select p.client_id, p.id, f.name, f.position
  from projects p
 cross join (values ('Social Media Design', 0), ('Social Media Videos', 1), ('Ad Creatives', 2)) as f (name, position)
 where not exists (select 1 from creative_folders x where x.project_id = p.id)
on conflict do nothing;

-- Creatives per month for one partner. A creative counts once, in the month
-- it first appeared: the same file again (same content hash) is not new.
-- Security invoker: RLS decides what the caller may count.
create or replace function public.creatives_monthly(p_client uuid, p_year int, p_project uuid default null)
returns table (month int, total int, images int, videos int, documents int)
language sql
stable
security invoker
set search_path = public
as $$
  with firsts as (
    select distinct on (coalesce(content_hash, id::text)) kind, created_at
      from creatives
     where client_id = p_client
       and (p_project is null or project_id = p_project)
     order by coalesce(content_hash, id::text), created_at
  )
  select extract(month from created_at at time zone 'Europe/Berlin')::int,
         count(*)::int,
         (count(*) filter (where kind = 'image'))::int,
         (count(*) filter (where kind = 'video'))::int,
         (count(*) filter (where kind = 'document'))::int
    from firsts
   where extract(year from created_at at time zone 'Europe/Berlin')::int = p_year
   group by 1
   order by 1;
$$;

-- Files per category (the counts in the folder tree).
create or replace function public.creative_folder_counts(p_client uuid)
returns table (folder_id uuid, files int)
language sql
stable
security invoker
set search_path = public
as $$
  select folder_id, count(*)::int from creatives where client_id = p_client group by folder_id;
$$;

grant execute on function public.creatives_monthly(uuid, int, uuid) to authenticated;
grant execute on function public.creative_folder_counts(uuid) to authenticated;

-- Private bucket; only images, videos and PDFs (no SVG or HTML: they can run script).
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('creatives', 'creatives', false, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
  'application/pdf'
])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
