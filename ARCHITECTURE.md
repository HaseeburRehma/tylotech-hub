# TyloTech Hub — Architecture & Scaling

How the system is layered today and the seams designed for growth.

## Layers

```
Browser ─▶ Middleware (auth/session refresh + route guards)
        ─▶ Server Components / Route Handlers
             ├─ lib/auth.ts        → who is the user (role + tenant + brand)
             ├─ lib/supabase/*     → server / browser / admin (service-role) clients
             ├─ lib/rate-limit.ts  → pluggable limiter (memory → Redis)
             ├─ lib/ai/*           → Claude prompt templates + generation
             └─ lib/config.ts      → all tunables in one place
        ─▶ Supabase (Postgres + RLS, Auth, Realtime, Storage)
```

## Multi-tenancy & security

- Every tenant row carries `client_id`; **Row Level Security** enforces isolation in the
  database itself (see `0001_init.sql`). The app can't accidentally leak cross-tenant data
  because the DB refuses it.
- Roles: `admin` / `team` (staff, see everything) and `client` (their tenant only).
  `is_staff()` / `auth_client_id()` are `security definer` helpers so policies stay simple
  and non-recursive.
- Route protection is layered: **middleware** blocks unauthenticated portal access;
  **server layouts** enforce role (e.g. `/internal` redirects clients);
  **RLS** is the final backstop at the data layer.

## White-label

A client's `{ primary_color, secondary_color, logo_url, company }` is read on login and
turned into RGB-channel CSS variables (`buildClientTheme` → `ThemeProvider`). The whole UI
re-skins with zero per-component work. Adding a client = inserting a row, not shipping code.

## Rate limiting (the key scaling seam)

`lib/rate-limit.ts` exposes one `RateLimiter` interface with two implementations:

| Mode | When | Scope |
|------|------|-------|
| In-memory fixed window | default (dev / single instance) | per-process |
| Upstash Redis (REST) | set `UPSTASH_REDIS_REST_URL` + `_TOKEN` | global, all instances |

The switch is automatic — **no call-site changes**. Limits live in `config.ts`
(`ai`, `auth`, `api`) and are env-overridable (`RL_AI_LIMIT`, …). The AI route is keyed by
authenticated user id (falling back to IP) and returns `429` + `Retry-After` when exceeded.

> Why this matters: the AI endpoint costs real money per call. In-memory is fine on one box;
> the moment you run multiple Vercel instances, flip on Upstash and limits become global.

## Designed-in scalability

- **Stateless app servers** — all state in Postgres / Redis / cookies → scale horizontally.
- **Service-role isolation** — privileged ops go through `lib/supabase/admin.ts` (server only).
- **Config centralization** — `lib/config.ts` is the single tuning surface.
- **Prompt templates in DB** — `ai_tools.prompt_template` lets staff edit AI behavior without deploys.
- **Indexed tenant columns** — hot query paths (`client_id`, `created_at`) are indexed.

## Next steps for production scale

1. **Bind pages to live data** via a thin repository layer (`lib/data/*`) so each page reads
   Supabase (RLS-scoped) instead of mock data — interface stays identical.
2. **Upstash Redis** for distributed rate limiting + response caching.
3. **Supabase Realtime** for live chat & updates (schema already supports it).
4. **Edge caching / ISR** for read-heavy marketing-style pages.
5. **Background jobs** (e.g. Inngest / queue) for report generation & API syncs.
6. **Observability** — structured logs + error tracking (Sentry) on the route handlers.
