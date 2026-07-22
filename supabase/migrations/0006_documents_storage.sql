-- =====================================================================
-- Private storage bucket for client documents (contracts, reports, invoices).
-- Downloads are served via short-lived signed URLs from the API.
-- Run after 0001–0005. Idempotent.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
