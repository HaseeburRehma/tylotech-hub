-- =====================================================================
-- Processes: step attachments + repeating runs. Run after 0040. Idempotent.
--
-- 1) Attachments per step — the weekly report as PDF / image / sheet file,
--    or a link (e.g. a Google Sheet). Files live in the private
--    "workflow-files" bucket; only staff can read; writes go through the API.
-- 2) Repeating runs — admins can start the next round, or let a run repeat
--    weekly / monthly: when a round finishes, the next one starts.
-- =====================================================================

create table if not exists public.workflow_step_attachments (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references workflow_run_steps (id) on delete cascade,
  run_id      uuid not null references workflow_runs (id) on delete cascade,
  kind        text not null check (kind in ('file', 'link')),
  name        text not null check (char_length(name) between 1 and 200),
  path        text,                                    -- storage path (kind = file)
  url         text check (url is null or url ~* '^https://'), -- kind = link
  mime        text,
  size        bigint,
  document_id uuid references documents (id) on delete set null, -- copy filed in the client's Documents
  uploaded_by uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((kind = 'file' and path is not null) or (kind = 'link' and url is not null))
);

create index if not exists idx_wf_attachments_step on workflow_step_attachments (step_id, created_at);
create index if not exists idx_wf_attachments_run on workflow_step_attachments (run_id);

alter table workflow_step_attachments enable row level security;
drop policy if exists wf_attachments_read on workflow_step_attachments;
create policy wf_attachments_read on workflow_step_attachments for select using (is_staff());
revoke insert, update, delete on workflow_step_attachments from anon, authenticated;

-- Private bucket for the files (signed URLs only). Uploads go browser → storage
-- through a one-time signed upload URL from the API, so the bucket itself
-- enforces size and type: 50 MB; PDF, images, Office/CSV/text, zip. No SVG/HTML.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workflow-files', 'workflow-files', false, 52428800, array[
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'text/csv', 'text/plain',
  'application/vnd.ms-excel', 'application/msword', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.text',
  'application/zip'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Repeating runs.
alter table workflow_runs add column if not exists repeat_every text check (repeat_every in ('week', 'month'));
alter table workflow_runs add column if not exists repeated_from uuid references workflow_runs (id) on delete set null;
alter table workflow_runs add column if not exists iteration int not null default 1 check (iteration >= 1);
