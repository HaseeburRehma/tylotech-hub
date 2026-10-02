-- =====================================================================
-- Optional free-text description on projects (New project modal).
-- Run after 0024. Idempotent.
-- =====================================================================
alter table public.projects add column if not exists description text;
