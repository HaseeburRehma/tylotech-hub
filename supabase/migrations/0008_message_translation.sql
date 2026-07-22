-- =====================================================================
-- Auto-translation for chat.
-- Client messages (German) are translated to English for the team;
-- team messages (English) are translated to German for the client.
-- Run after 0001–0007. Idempotent.
-- =====================================================================

alter table messages add column if not exists content_translated text;
alter table messages add column if not exists translated_to text; -- 'en' | 'de'
