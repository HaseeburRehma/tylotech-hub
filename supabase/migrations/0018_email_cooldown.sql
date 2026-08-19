-- =====================================================================
-- Email throttle: at most one chat-notification email per recipient per
-- cooldown window (see COOLDOWN_MS in src/lib/notify.ts). In-app bell
-- notifications are unaffected — they still fire on every message.
-- Run after 0017. Idempotent.
-- =====================================================================
alter table public.users add column if not exists last_email_at timestamptz;
