-- =====================================================================
-- Per-user job title (client-facing subtitle in chat / team lists).
-- Run after 0013. Idempotent.
-- =====================================================================
alter table public.users add column if not exists title text;

-- Seed titles for existing staff.
update public.users set title = 'Head of Support'      where email = 'team@tylotech.de';
update public.users set title = 'Performance Marketer' where email = 'haseebtylo@gmail.com';
update public.users set title = 'SEO Expert'            where email = 'abdul@tylotech.de';
update public.users set title = 'Developer'            where email = 'dev@tylotech.de';
update public.users set title = 'Designer'             where email = 'design@tylotech.de';
update public.users set title = 'Founder / Strategy'   where email = 'admin@tylotech.de';
