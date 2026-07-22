# Deploying TyloTech Hub

Production target per the brief: **Vercel** (frontend/SSR) + **Supabase** (EU region) — GDPR-friendly, EU data residency.

## 1. Supabase (one-time)

1. Create a project in an **EU region** (e.g. Frankfurt) for GDPR / EU data residency.
2. In the SQL editor, run the migrations **in order**:
   - `supabase/migrations/0001_init.sql` — schema + RLS
   - `supabase/migrations/0002_test_users.sql` — test accounts (change passwords / remove for prod)
   - `supabase/migrations/0003_phase2.sql` — integrations table
   - `supabase/migrations/0004_projects_and_seed.sql` — project assignment + demo seed
   - `supabase/migrations/0005_chat_and_storage.sql` — chat realtime + `logos` bucket
   - `supabase/migrations/0006_documents_storage.sql` — private `documents` bucket
3. Confirm **Realtime** is enabled for the `messages` table (the migration adds it to the `supabase_realtime` publication).
4. Storage buckets `logos` (public) and `documents` (private) are created by the migrations.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

Copy from `.env.example`. Required:

| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** secret |
| `ANTHROPIC_API_KEY` | enables live Claude AI tools |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` |
| `TEAM_SIGNUP_CODE` | invite code for `/signup` |

Optional (scale / live integrations):
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (distributed rate limiting),
`META_APP_ID`/`META_APP_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`GOOGLE_ADS_DEVELOPER_TOKEN` (switch integrations from sandbox to live).

> Never commit real values. `.env.local` and `.env.example` are gitignored.

## 3. Deploy

```bash
vercel        # preview
vercel --prod # production
```

`vercel.json` pins serverless functions to **`fra1` (Frankfurt)** to keep compute in the EU.
Auth callback/site URLs: set Supabase → Authentication → URL Configuration to your Vercel domain.

## 4. Hardening already in place

- **RLS** isolates tenants at the database level (client A can never read client B).
- **Security headers** (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) via `next.config.mjs`.
- **Rate limiting** on AI / messages / sync routes (in-memory → Redis via Upstash env).
- **Signed URLs** for private document downloads (60s TTL); the service-role key never reaches the browser.
- Middleware guards all portal routes; server layouts enforce role; `/internal/*` is staff-only.

## 5. Post-deploy checklist

- [ ] Migrations 0001–0006 run
- [ ] Env vars set (incl. service-role key as a secret)
- [ ] Supabase Auth redirect URLs point to the prod domain
- [ ] Create real admin/team accounts (then delete the seeded test users)
- [ ] Onboard the first real client (Internal Hub → Onboard client)
- [ ] Verify a client login sees only their own data
