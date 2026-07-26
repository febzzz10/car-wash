# AGENTS.md — WashPro Coding Agent Guide

## Project overview

WashPro is a car-wash operations and management application. It handles live wash job tracking, customer management, billing and invoices, staff administration, business reporting, and audit logging.

**Roles:** Administrators (full access) and Staff (permission-scoped).

**Data flow:** React SPA → Cloudflare Worker (`washpro-web`) → service binding → Hono API Worker (`car-wash`) → D1 (SQLite), KV (cache), R2 (file/invoice storage).

[Full architecture: `docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
[Current project state: `docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md)
[Deployment procedure: `docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
[Security rules: `docs/SECURITY.md`](docs/SECURITY.md)
[Key decisions: `docs/DECISIONS.md`](docs/DECISIONS.md)

**Before any change, read the relevant doc file.** Update docs after materially changing the project.

---

## Repository structure

```
apps/web/           React/Vite SPA (Cloudflare Worker with static assets)
apps/api/           Hono API (Cloudflare Worker, private)
packages/contracts/ Shared Zod schemas, TypeScript enums and types
packages/domain/    Business logic: normalisation, billing, permissions, etc.
docs/               Architecture, deployment, security, decisions, project state
e2e/                Playwright end-to-end tests
scripts/            Deployment smoke tests and migration scripts
tools/              Cloudflare migration CLI tools
```

Key config files:
- `pnpm-workspace.yaml` — pnpm monorepo definition
- `tsconfig.base.json` — shared strict TypeScript settings
- `apps/web/wrangler.jsonc` — frontend Worker with assets binding + service binding
- `apps/api/wrangler.jsonc` — API Worker with D1/KV/R2 bindings, secrets, env vars
- `apps/api/vitest.config.ts` — vitest pool config with D1 migrations + test secrets

---

## Architecture rules

1. Inspect existing code before modifying it. Understand patterns first.
2. Preserve the pnpm monorepo structure (`apps/*`, `packages/*`).
3. Keep frontend, API, contracts, and domain types synchronised when changing shared interfaces.
4. Reuse existing services, hooks, schemas, utilities, and components.
5. Do not duplicate business logic across packages or apps.
6. Do not introduce a new architecture (framework, router, state management, build tool) for a small fix.
7. Do not change unrelated functionality. Scope each change tightly.
8. UI-only requests must not change backend business logic.
9. Backend validation is always the source of truth — frontend validation is convenience only.

---

## TypeScript rules

Derived from `tsconfig.base.json`:
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- `verbatimModuleSyntax: true`, `noUnusedLocals: true`, `noUnusedParameters: true`

### Must follow
- Maintain strict TypeScript compatibility across the entire monorepo.
- Do not use `any` unless absolutely unavoidable and justified with a comment.
- Do not use `@ts-ignore` or `@ts-expect-error` merely to bypass errors. Fix the types.
- Do not disable lint or TypeScript rules to make checks pass.
- Properly type Cloudflare bindings via `Env` interface, not ad-hoc casts.
- Use `Context<AppBindings>` for Hono route handlers, not `any`-typed contexts.
- For D1 results: prefer `.first()` with type assertion (e.g. `.first() as UserRow | null`) over untyped access.
- Handle possibly-undefined array elements: use `data.jobs[0]!.id` after confirming length with assertions, or use optional chaining.
- Use Zod or the shared contract schemas for runtime validation of untrusted request input.

---

## Frontend rules

### Design system
All UI components are in `apps/web/src/components/ui.tsx`: `Button`, `Card`, `Dialog`, `EmptyState`, `ErrorState`, `PageHeader`, `SkeletonRows`, `StatusBadge`.

### Patterns to follow
- Use the existing `Dialog` component for modals and confirmations. Never use `window.prompt()`, `window.confirm()`, or `window.alert()`.
- Use `useApiData(path)` hook for data fetching (caching, loading, reload).
- Use `useToast()` for success/error notifications.
- Use `api<T>(path, init)` from `lib/api.ts` for all API calls. It handles CSRF, JSON parsing, and error mapping.
- Include loading (busy prop on Button), disabled, empty (EmptyState), error (ErrorState), and success states in every interactive component.
- Prevent duplicate submissions: disable buttons while requests are in-flight.
- Refresh data after mutations: call `state.reload()` or equivalent.
- Display API errors through the toast notification system. Never show raw stack traces or internal error codes to users.
- Preserve responsive behaviour. Test on narrow viewports where applicable.
- Do not expose sensitive backend information in the UI.
- Password inputs must use `type="password"` with show/hide toggles. Clear fields after submission or dialog closure. Never store passwords in localStorage, sessionStorage, or URLs.

---

## API and backend rules

### Route structure
- Hono app mounted at `apps/api/src/app.ts`. Sub-routers in `apps/api/src/routes/`.
- Public routes: `POST /api/v1/auth/login`, `GET /api/v1/bootstrap`, `GET /invoice/:token`.
- Protected routes: all other `/api/v1/*` routes require `requireSession` middleware.
- Admin-only routes: `requireAdmin` plus `requirePermission`.

### Must follow
- Validate all request bodies with Zod schemas defined in the route file.
- Keep server-side authorization on every privileged action. Frontend-hidden controls are not authorization.
- Use parameterised D1 statements (`c.env.DB.prepare(...).bind(...)`). Never concatenate user input into SQL.
- Handle missing D1 rows: `.first()` may return `null`. Always check and throw appropriate `ApiError`.
- Return consistent API error responses: `{ success: false, error: { code, message, requestId } }`.
- Do not silently swallow database or application errors. Use try/catch with safe fallback behaviour.
- Preserve pagination (cursor-based or page-based), filtering, and sorting behaviour in existing endpoints.
- Maintain backward compatibility unless the task explicitly changes the contract.

---

## Authentication and security rules

### Current auth architecture
- **Production**: static-admin mode (`APP_ENV=production`, `AUTH_MODE=static_admin`). Single admin identified by `ADMIN_LOGIN_EMAIL`, password verified via `ADMIN_LOGIN_PASSWORD` secret.
- **Development**: PBKDF2-based user authentication via seeded users in D1.
- **Test environment**: Overrides `APP_ENV` to `"test"` in vitest config to use PBKDF2 path.

### Session management
- Session cookie: `__Host-washpro_session` — HttpOnly, Secure, SameSite=Strict.
- Session token hashed with `SESSION_PEPPER` before storage.
- CSRF protection: `x-csrf-token` header required for state-changing requests (POST, PUT, PATCH, DELETE).
- Session expiry: configurable via `SESSION_TTL_SECONDS`, default 28,800 seconds (8 hours).

### Must follow
- Preserve session-token authentication. Do not introduce alternative auth without explicit approval.
- Preserve the `__Host-` cookie prefix and HttpOnly/Secure/SameSite settings.
- Preserve CSRF token generation (`createCsrfToken`) and validation.
- Preserve session expiration and revocation (disable account → revoke sessions, password reset → revoke sessions).
- Never log: passwords, temporary passwords, password hashes, session tokens, CSRF tokens, secrets, API credentials.
- Password changes or resets must revoke all active sessions for the affected user.
- Admin-only actions must remain protected by `requireAdmin` middleware.
- Never expose production secrets in source code or commit messages.
- Do not weaken password validation (`passwordPolicyError` function).
- Use constant-time comparison (`timingSafeEqual`) for password verification.
- Preserve login rate limiting (KV-based, 8 attempts per window).

---

## Staff and access rules

### Current behaviour (post-fix, commit `e23753c`)
- Administrators can enable or disable staff accounts without entering a manual reason. A confirmation dialog is shown.
- Administrators can reset staff passwords without entering a reason. A dialog with New Password + Confirm Password fields is shown. Minimum 12 characters. Passwords must match.
- Administrators can revoke all active sessions for a staff member without a reason. A confirmation dialog is shown.
- Audit logs are still created with system-generated reasons:
  - `"Account disabled by administrator"` / `"Account enabled by administrator"`
  - `"Password changed by administrator"`
  - `"ADMIN_REVOCATION"`
- The last active administrator cannot be disabled (`assertNotLastAdmin` guard).
- Optimistic concurrency: `version` field prevents conflicting updates.

---

## Audit-log rules

- Audit logging is implemented via `auditStatement()` in `apps/api/src/services/audit.ts`.
- Fields: ID, organization_id, branch_id, user_id, action, record_type, record_id, severity, reason, previous/new value JSON, request_id, IP, user_agent, timestamp.
- Sensitive key values (password, token, secret, cookie, card, PIN) are redacted before storage.
- Audit actions use severity levels: `INFO`, `WARNING`, `CRITICAL`.
- Never store raw passwords, tokens, secrets, or full sensitive payloads in audit logs.
- Never remove audit logging merely to simplify a workflow. If a reason field is no longer required, use a system-generated fallback.
- System-generated reasons are acceptable when manual entry is not required. Document the fallback string used.

---

## Database rules

### D1 schema
- Database: `washpro-dev` (binding: `DB` in `apps/api/wrangler.jsonc`).
- Migrations directory: `apps/api/migrations/`.
- Apply migrations: `pnpm --filter @washpro/api exec wrangler d1 migrations apply washpro-dev --remote`.

### Must follow
- Do not edit production data manually unless explicitly requested.
- Migrations must be safe, reviewed, and backward-compatible. Use `IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` where practical.
- Never delete or recreate the production database for a normal feature fix.
- Preserve foreign keys, indexes, constraints, `created_at`/`updated_at` timestamps, and optimistic concurrency (`version` column).
- Do not make destructive schema changes (DROP TABLE, DROP COLUMN) without explicit approval.
- Always test migrations against a disposable or local D1 database first.
- Use `INSERT OR IGNORE` for idempotent seed data in tests.

---

## Cloudflare rules

### Bindings (from wrangler.jsonc files)

**Web Worker (`washpro-web`):**
| Binding | Type | Target |
|---------|------|--------|
| `env.API` | Service binding | `car-wash` Worker |
| `env.ASSETS` | Assets | `dist/client/` directory |
| Not found handling | SPA | `/index.html` 200 fallback |

**API Worker (`car-wash`):**
| Binding | Type | Resource |
|---------|------|----------|
| `env.DB` | D1 | `washpro-dev` |
| `env.CACHE` | KV | `72cd173f95...` |
| `env.UPLOADS` | R2 | `washpro-uploads-dev` |
| `env.INVOICES` | R2 | `washpro-invoices-dev` |

**API Worker secrets** (set via `wrangler secret put`):
`ADMIN_LOGIN_PASSWORD`, `BOOTSTRAP_TOKEN`, `CSRF_SECRET`, `INVOICE_TOKEN_PEPPER`, `SESSION_PEPPER`

### Must follow
- Do not create new D1, KV, R2, Worker, Pages, or service-binding resources unless explicitly requested.
- Do not replace production resource IDs in wrangler.jsonc.
- Do not change production secrets. Use `wrangler secret put` only when explicitly instructed.
- Do not change `ALLOWED_ORIGINS` without checking the deployed web Worker URL.
- The API Worker must remain private: `workers_dev: false` on `car-wash`. Never expose `car-wash.xpersscarwash.workers.dev`.
- The frontend must use same-origin relative API URLs (`/api/v1/...`). Never use a direct API hostname in frontend code.
- Use the existing deployment commands from root `package.json`:
  - `pnpm run deploy:api` — deploys `@washpro/api`
  - `pnpm run deploy:web` — deploys `@washpro/web` via Vite plugin generated config
- Always run `pnpm --filter @washpro/api exec wrangler deploy --dry-run` before deploying API changes.

---

## Testing rules

### Commands (verified)
```bash
pnpm install --frozen-lockfile
pnpm -r typecheck                          # all workspaces
pnpm -r test                               # all workspaces
pnpm run build:web                         # frontend production build
pnpm --filter @washpro/api exec wrangler deploy --dry-run  # API dry-run
```

### Test structure
- Unit/contract tests: `packages/*/test/` or colocated `*.test.ts`.
- API integration tests: `apps/api/test/` with `@cloudflare/vitest-pool-workers`.
- Frontend component tests: `apps/web/src/test/` with jsdom.
- E2E tests: `e2e/` with Playwright.

### Must follow
- Run the relevant focused tests first, then the full monorepo checks before declaring completion.
- Never delete, skip, weaken, or disable tests merely to pass. Fix the implementation when behaviour is wrong.
- Update a test only when the intended behaviour has genuinely changed. Do not weaken assertions to make tests pass.
- Report pre-existing failures separately, but always investigate them — do not assume they are unrelated.
- New behaviour must receive automated tests (unit or integration).
- Test authorization failures (401, 403) as well as successful paths.
- Test edge cases: missing body, invalid input, expired tokens, wrong password, disabled accounts.

---

## Required verification workflow

After every change:

1. Review the diff: `git diff --check && git diff --stat && git diff && git status --short`
2. Run `pnpm install --frozen-lockfile`
3. Run package-level typecheck (e.g. `pnpm --filter @washpro/api typecheck`)
4. Run package-level tests (e.g. `pnpm --filter @washpro/api test`)
5. Run full monorepo typecheck: `pnpm -r typecheck`
6. Run full test suite: `pnpm -r test`
7. Build frontend if frontend code changed: `pnpm run build:web`
8. Run API dry-run if API code changed: `pnpm --filter @washpro/api exec wrangler deploy --dry-run`
9. Search for unwanted artifacts: temporary code, debug logging, ignored errors, leftover `window.prompt`/`window.confirm`
10. Report all results honestly. Never claim completion when required checks are failing.
11. Distinguish pre-existing failures from newly introduced failures.

---

## Git rules

- Do not commit unless explicitly asked.
- Do not push unless explicitly asked.
- Do not deploy unless explicitly asked.
- Keep commits focused. One concern per commit.
- Use conventional commit messages: `fix(scope): description`, `feat(scope): description`, `chore(scope): description`.
- Never commit: secrets, `.env` files, generated build output (`dist/` is in `.gitignore`), local databases, temporary files, dependency folders.
- Review the final diff before committing (`git diff --cached`).
- Confirm working tree state after committing: `git status`.

---

## Deployment rules

1. Local verification must pass completely (typecheck, tests, build) before any deployment.
2. Use the repository's existing production deployment workflow:
   - API: `pnpm run deploy:api`
   - Web: `pnpm run deploy:web`
3. Do not change Cloudflare resources (D1, KV, R2 bindings or IDs) during a routine deployment.
4. Record the deployment version ID when available (see output of `wrangler deploy`).
5. After deployment, verify: `GET /login` → 200 SPA, `POST /api/v1/auth/login` (wrong password) → 401 JSON, `GET /invoice/test` → 404 JSON from API.
6. Browser smoke testing: log in, verify key workflows. Do not test destructive actions on the only owner/admin account.
7. Distinguish endpoint health checks from full interactive browser verification.

---

## Documentation memory system

The `docs/` directory contains persistent project memory. Agents must read the relevant files before making changes.

| File | When to read | When to update |
|------|-------------|----------------|
| `ARCHITECTURE.md` | Any non-trivial change | Only when architecture changes |
| `PROJECT_STATE.md` | Start of every session | After any material change |
| `DEPLOYMENT.md` | Before any deployment | When deployment steps or bindings change |
| `SECURITY.md` | Before auth/session changes | When security behaviour changes |
| `DECISIONS.md` | Before questioning existing design | When an important technical decision is made |

**Rules:**
- Do not turn these files into daily logs. Keep them accurate and concise.
- Update `PROJECT_STATE.md` after a task materially changes the project.
- Add an entry to `DECISIONS.md` when an important architectural decision is made (with date and rationale).

---

## Task completion report format

Every task must end with a report containing:

1. Task summary
2. Root cause (for fixes)
3. Files changed
4. Implementation details
5. Security impact
6. Database impact (if any)
7. Typecheck results (package and monorepo)
8. Test results (package and monorepo)
9. Build results
10. Deployment status and version IDs
11. Git status
12. Remaining issues
13. Manual verification still required (e.g. browser login test)
