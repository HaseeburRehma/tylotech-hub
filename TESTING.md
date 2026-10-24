# TyloTech Hub — Testing & Security Rules

## Golden Rule

**After every task, act as a security tester.** Try to break the app. Simulate
multiple concurrent users. Never accept "it compiles" as proof of correctness.

---

## 1. Test Levels

| Level | Runner | Scope | When |
|-------|--------|-------|------|
| **Unit** | Vitest | Pure functions, helpers, shared logic | Every PR |
| **Integration** | Vitest | API routes with mocked Supabase | Every PR |
| **E2E** | Playwright | Full browser flows against dev server | Before release |

### Unit tests (`src/**/*.test.ts`)
- Co-locate next to the file under test.
- No network, no DB, no env vars.
- Cover edge cases: empty input, max length, Unicode, null, undefined.

### Integration tests (`src/**/*.integration.test.ts`)
- Test API route handlers directly via `NextRequest` / `NextResponse`.
- Mock `@/lib/supabase/server` and `@/lib/auth` at the module level.
- Verify: auth guard, input validation, RLS scoping, rate limiting, status codes.

### E2E tests (`e2e/**/*.spec.ts`)
- Playwright against the dev server.
- Cover critical paths: login, client switching, chat, projects CRUD, workflows.

---

## 2. Post-Task Security Checklist

Run through this **after every task** before marking it done:

### Auth & Access Control
- [ ] Every API route checks `getAuthUser()` and returns 401 if missing.
- [ ] Client-scoped data checks `user.client_id` — a client cannot read another client's data.
- [ ] Staff-only routes check `role === "admin" || role === "team"`.
- [ ] Admin-only routes check `role === "admin"`.

### Input Validation
- [ ] All user input is trimmed and length-capped.
- [ ] No raw user input in SQL (use parameterised queries / Supabase SDK).
- [ ] File uploads validate MIME type and size.
- [ ] JSON bodies are parsed with `.catch()` — malformed JSON returns 400.

### Data Isolation
- [ ] Switching the active client shows only that client's data.
- [ ] Internal/staff views never leak client data to other clients.
- [ ] RLS policies match what the app assumes.

### Concurrency & Race Conditions
- [ ] Rapid duplicate submissions are idempotent or rate-limited.
- [ ] Optimistic UI updates handle stale data gracefully.
- [ ] Realtime subscriptions filter by the correct `client_id`.

### Error Handling
- [ ] API routes never expose stack traces or internal DB errors.
- [ ] 5xx errors have a generic message; detail goes to server logs.
- [ ] Frontend shows user-friendly error states, not raw JSON.

---

## 3. Simulated Multi-User Scenarios

After every significant change, mentally (or with tests) simulate:

1. **Staff A and Staff B** editing the same client's project at once.
2. **Client X** trying to access Client Y's chat, documents, or projects.
3. **Unauthenticated user** hitting every API route.
4. **Rapid-fire requests** from one user (rate limit verification).
5. **Client switching** mid-action (e.g., switch client while a form is submitting).

---

## 4. File Naming Conventions

```
src/lib/foo.ts           → src/lib/foo.test.ts            (unit)
src/app/api/bar/route.ts → src/app/api/bar/route.test.ts  (integration)
e2e/chat.spec.ts                                          (E2E)
```

---

## 5. Running Tests

```bash
npm test                    # all unit + integration tests
npx vitest run --reporter=verbose   # verbose output
npx playwright test         # E2E (when configured)
```
