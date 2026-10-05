# Live Activity Feed

Expose a small, authenticated, privacy-safe stream of real TyloHQ activity
("Neue Anfrage über Google · Fahrschule · Düsseldorf · vor 3 Min.") so the
TyloTech marketing website can show it in its floating "TyloHQ Live" bar.

The website side is already built and deployed. It shows **only** what this
feed returns, shows **every event id exactly once** per visitor (also across
reloads), and falls back to a neutral "Live aus TyloHQ" state when nothing new
arrives. Nothing is invented on the website — if this feed is empty, the bar is
quiet.

```
 TyloHQ (this repo)                                    tylotech-website
 ──────────────────                                    ────────────────
 sync jobs / forms / staff UI
        │  emitActivity()
        ▼
 activity_events (Supabase, EU)                         Vercel env:
        │                                                 TYLOHQ_FEED_URL
        ▼                                                 TYLOHQ_FEED_TOKEN
 GET /api/public/live-feed   ◀── Bearer LIVE_FEED_TOKEN ── /api/live-feed (server)
        │  JSON, no-store                                     │ validates, dedupes
        └──────────────────────────────────────────────────▶  ▼
                                                         Floating bar (browser)
                                                         polls every 30 s,
                                                         shows each id once
```

> **Why this matters** — the bar presents these lines as real, live activity.
> Under German competition law (UWG) invented or recycled "live" social proof
> is misleading advertising. Every event must trace back to something that
> actually happened in TyloHQ, for a client who agreed to be shown.


> **Status (Oct 2026): implemented.** Migration `0031_activity_events.sql`, `src/lib/live-feed.ts`,
> `GET /api/public/live-feed`, staff API `/api/activity` (record / hide events), consent via
> `PATCH /api/clients/[id]` (`publicFeedOptIn`, `publicFeedLabel`), the Internal Hub panel
> (client detail → "Live-Feed auf der Website") and `leads` events from Meta / Google Ads syncs.
> Not yet built: `ranking` (needs per-query Search Console data) and `visitors` (GA4 realtime).
> The daily cron stays at 06:00 — a `*/15` schedule needs a Vercel plan that allows it.

---

## 1. Endpoint contract

`GET /api/public/live-feed`

| Aspect | Rule |
|---|---|
| Auth | `Authorization: Bearer <LIVE_FEED_TOKEN>` — **header only**, no `?key=` fallback. Compare with `crypto.timingSafeEqual`. |
| Not configured | `LIVE_FEED_TOKEN` unset → `503 { "error": "Backend not configured." }` (same as `/api/cron/sync`). |
| Wrong/missing token | `401 { "error": "Unauthorized." }` |
| Rate limit | `getRateLimiter().limit("feed:" + ip, config.rateLimit.feed)` — default 60 req / 60 s; `429` + `rateLimitHeaders(rl)`. Add `RL_FEED_*` overrides to `src/lib/config.ts`. |
| Runtime | `export const runtime = "nodejs"`; `export const dynamic = "force-dynamic"`. |
| Caching | Response header `Cache-Control: no-store`. |
| CORS | None. Server-to-server only (the website proxies it). Do not add `Access-Control-Allow-Origin`. |
| Method | `GET` only; anything else → 405 (Next default). |

### Response `200`

```json
{
  "events": [
    {
      "id": "evt_01JB8Z6Q2V4K9T7M3N5P8R1S2T",
      "kind": "query",
      "title": "Neue Anfrage über Google",
      "detail": "Fahrschule · Düsseldorf",
      "occurredAt": "2026-10-01T14:21:32.000Z"
    },
    {
      "id": "evt_01JB8YZ9X1C3D5F7G9H2J4K6L8",
      "kind": "leads",
      "title": "2 neue Leads",
      "detail": "Meta Ads · Gebäudereinigung",
      "occurredAt": "2026-10-01T14:15:02.000Z"
    }
  ],
  "generatedAt": "2026-10-01T14:24:10.512Z"
}
```

(The website also accepts a bare array, but please return the object form.)

### Event fields — the website enforces these exactly

| Field | Type | Rules (events breaking any rule are dropped by the website) |
|---|---|---|
| `id` | string | 1–128 chars. **Stable and never reused.** The same real-world event must always have the same id; a new event must get a new id. This is how "never show twice" works. Use the `activity_events.id` uuid (optionally prefixed). |
| `kind` | enum | One of `query`, `visitors`, `leads`, `ranking`, `booking`, `review` (drives the icon). |
| `title` | string | 1–80 chars, German, sentence case, no trailing period. Shown in bold. |
| `detail` | string? | ≤ 80 chars. Second line, before the relative time. Must not contain personal data (see §3). |
| `occurredAt` | string | ISO 8601 UTC. When it **happened** (not when it was inserted). Must be within the last **24 h** and not more than 60 s in the future. |

Selection rules for the response:

- only events of clients with `public_feed_opt_in = true` (see §3)
- only `occurred_at > now() - interval '24 hours'`
- newest first, **max 20**
- never edit `title`/`detail` of an id that may already have been served — create a new event instead

---

## 2. Data model

New migration `supabase/migrations/0031_activity_events.sql`:

```sql
-- Public-safe activity stream for the marketing website's live bar.
create table if not exists activity_events (
  id           uuid primary key default uuid_generate_v4(),
  client_id    uuid not null references clients(id) on delete cascade,
  kind         text not null check (kind in ('query','visitors','leads','ranking','booking','review')),
  title        text not null check (char_length(title) between 1 and 80),
  detail       text check (detail is null or char_length(detail) <= 80),
  occurred_at  timestamptz not null,
  source       text not null check (source in ('manual','meta_ads','google_ads','ga4','search_console','form','booking','review')),
  -- idempotency key from the producer, e.g. "metric_points:<client>:<date>:meta_ads:leads=7"
  source_ref   text not null,
  hidden       boolean not null default false,   -- staff kill-switch per event
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (source, source_ref)
);

create index if not exists activity_events_recent_idx
  on activity_events (occurred_at desc) where hidden = false;

alter table activity_events enable row level security;

-- Staff see everything, clients see their own rows (same pattern as `updates`).
create policy activity_events_read on activity_events
  for select using (is_staff() or client_id = auth_client_id());
-- No insert/update/delete policies: writes go through the service role only
-- (lib/supabase/admin.ts), like kpis/metric_points.
revoke insert, update, delete on activity_events from anon, authenticated;

-- Consent + public label per client (default: not shown anywhere).
alter table clients
  add column if not exists public_feed_opt_in boolean not null default false,
  add column if not exists public_feed_label text
    check (public_feed_label is null or char_length(public_feed_label) <= 60);
-- e.g. public_feed_label = 'Fahrschule · Düsseldorf' (industry · city, no company name
-- unless the client explicitly wants it).
```

---

## 3. Consent & privacy (DSGVO)

1. **Opt-in per client.** `clients.public_feed_opt_in` defaults to `false`.
   Only staff can set it (Settings → client detail), and only with the
   client's written agreement (keep it in the contract/AVV notes).
2. **No personal data in the feed — ever.** No names, emails, phone numbers,
   free-text from inquiries, or anything that identifies a lead or reviewer.
   `title` describes *what* happened; `detail` is the client's
   `public_feed_label` plus at most a channel ("Meta Ads", "Google").
3. **Company name only with explicit consent.** Default label is
   industry + city ("Gebäudereinigung · Düsseldorf").
4. **Search terms** (ranking events) may only appear if generic and
   non-personal (e.g. "rohrreinigung nrw"); otherwise omit the term.
5. Data stays in the EU Supabase project (Frankfurt) as per `DEPLOYMENT.md`;
   the endpoint only ever serialises the five public fields above.
6. Revoking consent (`public_feed_opt_in = false`) takes effect on the next
   poll — the query filters on it, no cleanup job needed.

---

## 4. Producers — what creates events

All producers call one helper so ids, limits and idempotency are consistent:

```ts
// src/lib/live-feed.ts
export async function emitActivity(
  admin: SupabaseClient,
  e: {
    clientId: string;
    kind: LiveKind;
    title: string;          // ≤ 80, German
    detail?: string;        // ≤ 80, defaults to the client's public_feed_label
    occurredAt: Date;       // when it happened
    source: ActivitySource;
    sourceRef: string;      // idempotency key, unique per source
    createdBy?: string;
  },
): Promise<void>
// → insert … on conflict (source, source_ref) do nothing
```

| kind | Producer | Trigger | Example title / detail | `source_ref` |
|---|---|---|---|---|
| `leads` | `syncClient()` in `src/lib/integrations/sync.ts` (Meta Ads, Google Ads) | today's `metric_points.leads` increased since the previous sync | "3 neue Leads" / "Meta Ads · {label}" | `metric_points:{client}:{date}:{provider}:leads={newTotal}` |
| `ranking` | `syncClient()` for Search Console | a tracked query's avg. position improves into the top 3 (or by ≥ 3 places) vs. the previous sync | "Ranking verbessert auf Platz 1" / "„rohrreinigung nrw“" | `gsc:{client}:{query}:{date}:pos={rounded}` |
| `visitors` | new GA4 realtime call (`runRealtimeReport`, metric `activeUsers`) in the sync job | at most **once per client per hour**, only if `activeUsers ≥ 10` | "23 Besucher gerade live" / "{label}" | `ga4rt:{client}:{yyyy-mm-ddThh}` |
| `query` | contact/lead form ingestion (when it exists) or staff | a new inquiry is received | "Neue Anfrage über Google" / "{label}" | `form:{inquiryId}` |
| `booking` | booking integration (Calendly/Cal.com webhook, later) or staff | an initial consultation is booked | "Erstgespräch gebucht" / "{label}" | `booking:{bookingId}` |
| `review` | Google Business Profile reviews (later) or staff | a new 4–5★ review arrives | "Neue 5★-Bewertung" / "Google · {label}" | `review:{reviewId}` |
| any | **Manual** — Internal Hub form (staff only) | staff records a real event | free, within limits | `manual:{uuid}` |

Notes:

- `metric_points` stores daily totals, so emit on the **delta**
  (`new - previous`), and use the new total in `source_ref` so re-running a
  sync never duplicates.
- `syncClient()` currently doesn't write to `updates`; emitting activity
  events must not change existing KPI behaviour.
- **Freshness:** the website polls every 30 s, but `vercel.json` runs
  `/api/cron/sync` once a day (06:00). For a "live" feel add a frequent
  schedule (e.g. `*/15 * * * *`) — `auto: true` already skips sources synced
  < 25 min ago. Event-driven producers (forms, webhooks, manual) appear
  immediately.

---

## 5. Implementation plan (files)

| File | Change |
|---|---|
| `supabase/migrations/0031_activity_events.sql` | table, index, RLS, client consent columns (§2) |
| `src/lib/live-feed.ts` | `LiveKind`, `emitActivity()`, `serializePublicFeed(rows)` (maps to the five public fields, trims, drops anything invalid) |
| `src/app/api/public/live-feed/route.ts` | the endpoint (§1): token check with `timingSafeEqual`, rate limit, admin client query with join on `clients` where `public_feed_opt_in` and `not hidden`, last 24 h, limit 20 |
| `src/lib/config.ts` | `rateLimit.feed` + `RL_FEED_LIMIT` / `RL_FEED_WINDOW` |
| `src/lib/integrations/sync.ts` | emit `leads` / `ranking` / `visitors` (§4) |
| `src/lib/integrations/fetchers.ts` | `fetchGa4Realtime()` (activeUsers) |
| Internal Hub UI | per-client toggle *"Im TyloHQ-Live-Feed zeigen"* + label field; per-event *hide*; manual "Aktivität erfassen" form with live preview of how the line will look |
| `.env.example` | `LIVE_FEED_TOKEN=` (long random string, `openssl rand -base64 48`) |
| `vercel.json` | optional `*/15 * * * *` sync schedule |

Query sketch for the route:

```ts
const { data } = await admin
  .from("activity_events")
  .select("id, kind, title, detail, occurred_at, clients!inner(public_feed_opt_in)")
  .eq("hidden", false)
  .eq("clients.public_feed_opt_in", true)
  .gt("occurred_at", new Date(Date.now() - 24 * 3600_000).toISOString())
  .order("occurred_at", { ascending: false })
  .limit(20);
```

---

## 6. Tests (vitest, `src/lib/live-feed.test.ts`)

- serializer outputs exactly `id, kind, title, detail?, occurredAt` — no `client_id`, `source`, `source_ref`
- drops rows with title > 80, unknown kind, `occurred_at` older than 24 h or > 60 s in the future
- `emitActivity` twice with the same `(source, sourceRef)` → one row
- route: no token → 401; wrong token → 401; unset `LIVE_FEED_TOKEN` → 503; `?key=` alone → 401
- route: events of a client with `public_feed_opt_in = false` and `hidden = true` rows never appear

---

## 7. Connecting the website

1. In TyloHQ (Vercel project `tylotech-hub`): set `LIVE_FEED_TOKEN`.
2. In the website (Vercel project `tylotech-website`):
   - `TYLOHQ_FEED_URL = https://<tylohq-domain>/api/public/live-feed`
     (e.g. `https://tylohq.de/api/public/live-feed`)
   - `TYLOHQ_FEED_TOKEN = <same value as LIVE_FEED_TOKEN>`
3. Redeploy the website. Check `https://tylotech.vercel.app/api/live-feed`
   → `{ "configured": true, "events": [...] }`.

---

## 8. Acceptance checklist

- [ ] Feed returns only opted-in clients, last 24 h, newest 20, `no-store`
- [ ] Token only via `Authorization` header, timing-safe compare, 401/503 as specified
- [ ] Every event id is unique and stable; re-running syncs creates no duplicates
- [ ] No personal data in any `title`/`detail`
- [ ] Staff can hide a single event and toggle a client's consent
- [ ] Website shows a new event within ~30 s of it being inserted, exactly once
