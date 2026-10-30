-- =====================================================================
-- Creatives: small thumbnails and browser-friendly previews.
--   thumb_path    a JPEG of at most 480 px (first frame of a video, first
--                 page of a PDF, a downscaled photo) for grids and the app.
--   preview_path  a full-size JPEG where the original can't be shown in a
--                 browser (HEIC photos from iPhones).
-- Both live in the private `creatives` bucket under <client>/thumbs/ and
-- <client>/previews/. Files unpacked from zips in cloud folders are stored
-- like uploads (storage_path) and keep their source and connected folder.
-- Run after 0049. Idempotent.
-- =====================================================================

alter table public.creatives add column if not exists thumb_path text;
alter table public.creatives add column if not exists preview_path text;

do $$
begin
  alter table creatives add constraint creatives_thumb_path_check check (thumb_path is null or thumb_path ~ '^[0-9a-f-]{36}/thumbs/[0-9a-f-]{36}\.jpg$');
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table creatives add constraint creatives_preview_path_check check (preview_path is null or preview_path ~ '^[0-9a-f-]{36}/previews/[0-9a-f-]{36}\.jpg$');
exception when duplicate_object then null;
end;
$$;
