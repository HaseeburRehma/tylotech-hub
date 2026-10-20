# TyloTech Hub

White-label client portal **and** internal command center. Built per the TyloTech Hub
product brief — a premium, dark, mobile-first SaaS that re-skins to each client's brand.

> Notion-meets-Linear-meets-luxury-agency-portal. Gold & Black by default; every client
> gets their own theme.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres, Auth, RLS, Realtime, Storage) — graceful mock fallback when unconfigured
- **Anthropic Claude** for AI tools — graceful demo fallback when unconfigured
- **Recharts** for charts, **Framer Motion** for interactions, **lucide-react** icons

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — app runs on mock data without keys
npm run dev                  # http://localhost:3000
```

The app is **fully demoable with zero config** (mock data + AI demo mode). Add keys to
`.env.local` to switch to live Supabase + Claude with no code changes.

## Screens (per brief)

| # | Screen | Route |
|---|--------|-------|
| 1 | Login (white-label aware) | `/login` |
| 2 | Client Dashboard (KPIs, charts, updates, projects) | `/dashboard` |
| 3 | Performance (trends, channels, exportable) | `/performance` |
| 4 | AI Tools (grid + locked/upgrade states) | `/ai-tools` |
| 4b| AI tool runner (Content Generator, Ad Copy) | `/ai-tools/[slug]` |
| 5 | Chat & Updates (realtime-ready + timeline) | `/chat` |
| 6 | Documents (filterable list) | `/documents` |
| 7 | Internal Hub (MRR, clients, team, pipeline) | `/internal` |

A floating **"Message TyloTech"** widget is available on every portal page.

## White-label system

The killer feature. Each client stores `{ primary_color, secondary_color, logo_url,
company_name }`. At runtime `ThemeProvider` converts that into RGB-channel CSS variables
consumed by Tailwind, so the **entire UI re-skins with zero component changes**.

- Default: TyloTech **Gold `#C9A84C` / Black**
- Demo themes: Nordic Estate (sky blue), Velform Fitness (rose)
- Try it live via the **White-label** switcher in the top bar.

Add a real client theme in `src/lib/theme/themes.ts`.

## Backend

- `supabase/migrations/0001_init.sql` — full schema + multi-tenant **Row Level Security**
  (a client can never read another client's data; staff/admin see all).
- `supabase/seed.sql` — demo clients, AI tools, KPIs.
- `src/lib/supabase/{client,server}.ts` — SSR-safe clients, no-op when env is absent.

## Scaling & reliability

How the app stays fast and correct as partners, users and data grow (Vercel = many
short-lived, stateless instances in `fra1`; Supabase Postgres = the one source of truth).

| Concern | Where | What |
|---|---|---|
| Stateless servers | `src/lib/rate-limit.ts`, migration 0044 | Rate limits live in a shared store — Upstash Redis if `UPSTASH_REDIS_REST_*` is set, otherwise Postgres (`rate_limit_hit()`, unlogged table). In-memory only as a fail-open fallback. |
| Asynchronism | `src/lib/background.ts` | Slow side effects run after the response (`waitUntil`): push + email delivery, message translation, step-assignment emails. The durable write (message, in-app notification) happens first. |
| Caching | `listStaff()` in `src/lib/workflows.ts` | Cache-aside with `unstable_cache` (5 min) + `revalidateTag(STAFF_TAG)` on team changes. Only data that is identical for every staff member is cached across requests — never anything tenant-specific. Translations are stored on the message (computed once). |
| Database | migrations 0042–0044 | Indexes for the hot paths (chat inbox, unread counts, search incl. translated text, leads per owner). Aggregation runs in SQL (`chat_inbox()`), not in the app. |
| Pagination | `CHAT_PAGE` in `src/lib/data.ts` | Chats load the newest 500 messages; older ones on demand. Mobile loads 100. |
| Retries | `src/lib/http.ts` | Calls to Meta, Google and Resend retry 429/5xx/network errors with exponential backoff + jitter; emails carry an idempotency key so a retry never sends twice. |
| Degradation | `src/lib/ai/translate.ts` | Translation falls through Google Cloud → free Google routes → Claude, with a cool-down for a provider that is throttled or out of credit. |
| Background jobs | `vercel.json`, pg_cron | Daily sync + monthly reports (Vercel Cron); response-time alerts every 15 min (pg_cron in Postgres). |
| Health | `GET /api/health` | 200 when the database answers within 3 s, else 503 — point an uptime monitor at it. |
| Security | RLS, `next.config.mjs` | Tenant isolation in Postgres (RLS); writes to sensitive tables only through API routes; security headers (frame, nosniff, permissions incl. microphone only for our own pages, COOP). |

## AI tools

`POST /api/ai/generate { tool, inputs, brand }` — server-only Claude calls (key never
reaches the browser). Prompt templates live in `src/lib/ai/prompts.ts`, mirroring the
editable `ai_tools.prompt_template` DB column. Falls back to demo output without a key.

Model: `claude-sonnet-4-20250514` (override via `ANTHROPIC_MODEL`).

## Project structure

```
src/
  app/
    login/                 # Screen 1
    (portal)/              # Authed shell: dashboard, performance, ai-tools, chat, documents, internal
    api/ai/generate/       # Claude endpoint
  components/
    ui/ charts/ layout/ theme/ chat/
  lib/
    theme/ supabase/ ai/ mock/ nav.ts status.ts utils.ts
  types/
```
