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
