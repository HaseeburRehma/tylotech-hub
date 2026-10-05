-- =====================================================================
-- Who last edited an AI tool prompt, and when (shown in the prompt editor).
-- Run after 0028. Idempotent.
-- =====================================================================
alter table public.ai_tools add column if not exists updated_at timestamptz;
alter table public.ai_tools add column if not exists updated_by uuid references public.users (id) on delete set null;
