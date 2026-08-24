-- =====================================================================
-- Clean, human-readable client URLs: /internal/clients/<slug> instead of the
-- raw UUID. The slug is only a lookup key — access stays gated by staff-only
-- routing + RLS, so this is UX, not a security change. Legacy UUID links still
-- resolve (getClientByRef accepts both). Run after 0020. Idempotent.
-- =====================================================================

alter table public.clients add column if not exists slug text;

-- Backfill: slugify company/name; on name collisions, append a short id fragment
-- so the unique index below never fails. Only fills empty slugs (safe to re-run).
with base as (
  select
    id,
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(coalesce(company, name, 'client')), '[^a-z0-9]+', '-', 'g')), ''),
      'client'
    ) as b
  from public.clients
),
ranked as (
  select id, b, row_number() over (partition by b order by id) as rn
  from base
)
update public.clients c
set slug = case when r.rn = 1 then r.b else r.b || '-' || substr(replace(c.id::text, '-', ''), 1, 4) end
from ranked r
where c.id = r.id and (c.slug is null or c.slug = '');

create unique index if not exists clients_slug_key on public.clients (slug);
