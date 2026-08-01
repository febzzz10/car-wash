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

### New Wash wizard flow

The New Wash wizard has **six steps**:

1. Customer
2. Vehicle
3. Assign
4. Live photo & location
5. Services
6. Review

Benefits (coupons, referrals, rewards, manual discounts) are **not** selected during wash-job creation. The create-job API rejects benefit fields as unknown. Benefits may only be applied during first-payment recording through the Record Payment dialog, and only before the first successful payment (while `billing_locked_at` is NULL and `paid_amount_minor` is 0). Existing historical benefit records on wash jobs remain readable.

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
- **Production — `static_admin` mode** (`APP_ENV=production`, `AUTH_MODE=static_admin`): single admin identified by `ADMIN_LOGIN_EMAIL`, password verified via `ADMIN_LOGIN_PASSWORD` secret.
- **Production — `hybrid_admin_staff` mode** (`APP_ENV=production`, `AUTH_MODE=hybrid_admin_staff`, default in `wrangler.jsonc`): login identifiers matching `ADMIN_LOGIN_EMAIL` are always authenticated against the static admin credentials (the identifier is reserved and cannot be shadowed by a DB user); all other identifiers fall through to the PBKDF2 database path (username/email/phone lookup, status checks, role/permissions from the user row). The static administrator cannot change their password through the API — change-password is rejected with `403 STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY`; the password is managed through the `ADMIN_LOGIN_PASSWORD` deployment secret.
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
| `env.NOMINATIM_THROTTLE` | Durable Object | Nominatim 1s throttle (class `NominatimThrottle`) |

**API Worker secrets** (set via `wrangler secret put`):
`ADMIN_LOGIN_PASSWORD`, `BOOTSTRAP_TOKEN`, `CSRF_SECRET`, `GEOCODE_CACHE_PEPPER`, `INVOICE_TOKEN_PEPPER`, `LOCATIONIQ_API_KEY`, `SESSION_PEPPER`

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

---

## Vehicle autocomplete rules

### Current state (commit `169da79`)

Vehicle Model and Vehicle Make both have persistent, organization-scoped autocomplete dictionaries stored in Cloudflare D1.

### Database tables

- `vehicle_models` (migration `0012_vehicle_models.sql`) — normalized model names per organization.
- `vehicle_makes` (migration `0013_vehicle_makes.sql`) — normalized make names per organization.

Both tables share the same schema:
- `id`, `organization_id`, `name`, `normalized_name`, `created_at`, `updated_at`
- `UNIQUE (organization_id, normalized_name)` — prevents duplicates per org.

### Shared frontend component

`apps/web/src/components/vehicle-attribute-autocomplete.tsx` is a generic autocomplete with:
- `endpoint` prop (e.g. `/vehicle-makes`, `/vehicle-models`).
- 200ms debounce, AbortController for stale request cancellation.
- ARIA attributes: `combobox` role, `aria-autocomplete="list"`, `aria-expanded`, `aria-activedescendant`, `aria-controls`.
- Keyboard navigation: ArrowDown/ArrowUp to highlight, Enter to select, Escape to dismiss.
- Click-outside dismiss, loading spinner, disabled/required support.
- API failure fallback: input remains editable, no unhandled errors.

Thin wrappers:
- `VehicleModelAutocomplete` → endpoint `/vehicle-models`
- `VehicleMakeAutocomplete` → endpoint `/vehicle-makes`

### API endpoints

- `GET /api/v1/vehicle-models?q=<prefix>&limit=<1-20>` — protected, scoped by org.
- `GET /api/v1/vehicle-makes?q=<prefix>&limit=<1-20>` — protected, scoped by org.

Both use:
- `requireSession` + `requirePermission("vehicles.read")`.
- Prefix-range scan (`>=` / `<`) on `normalized_name`.
- Exact match ranked first, rest alphabetical.
- Max 80 characters, limit clamped 1–20.
- Parameterised queries — no `LIKE` or `GLOB`.

### Vehicle create/update integration (`apps/api/src/routes/vehicles.ts`)

- `POST /api/v1/vehicles` — normalizes make/model via `normalizeVehicleMake` / `normalizeVehicleModel`, upserts into corresponding dictionary within `DB.batch()`.
- `PATCH /api/v1/vehicles/:id` — same normalization and upsert after successful version-guarded update.
- Upsert uses `ON CONFLICT (organization_id, normalized_name) DO UPDATE SET updated_at = excluded.updated_at` — preserves first clean display capitalization.
- Upsert only runs after successful vehicle save, never on validation/auth/conflict failures.
- Blank/null values are never stored.

### Normalization (`packages/domain/src/normalization.ts`)

`normalizeVehicleMake` delegates to the same logic as `normalizeVehicleModel`:
- Trims surrounding whitespace.
- Collapses repeated internal whitespace.
- Produces lowercase normalized value for deduplication.
- Returns `null` for blank input.
- Preserves meaningful punctuation (hyphens, etc.).

### Backfill rules

- Backfill is only required for records that existed **before** the migration was applied, or were imported directly into D1 without using the normal API.
- New vehicles created/edited through the normal API automatically save their make/model.
- **Do not add public or temporary backfill HTTP routes.**
- The TypeScript backfill scripts (`scripts/backfill-vehicle-models.ts`, `scripts/backfill-vehicle-makes.ts`) require a Workers D1 binding and cannot be run directly against remote D1 via `pnpm tsx`.
- If backfill is genuinely required, use `wrangler d1 execute` with safe idempotent `INSERT ... ON CONFLICT` statements.

### Security and isolation

- All queries are scoped by `auth.organizationId`.
- `normalized_name` is never exposed to clients.
- No public or admin bypass backfill endpoint exists.
- CSRF protection, session auth, and permission checks are preserved for all state-changing operations.
- Do not request or expose production credentials.

### Verified deployment

- API Worker (`car-wash`): `ac745ccf-1972-49b9-8959-074aac321e10`
- Web Worker (`washpro-web`): `0d6919f1-563f-4ca3-afcc-9c98c6e7d4d3`
- 263 automated tests passed (0 failed, 0 skipped).
- All authenticated production tests A–H passed.
- **Status:** fully implemented, deployed and production-verified.

---

## Server-side reverse-geocoding rules

### Current state (implemented 2026-07-28)

- `POST /api/v1/geocode/reverse` with JSON body `{ latitude, longitude }` returns `{ data: { place } }`.
- Protected by `requireSession` + `requirePermission("wash_jobs.create")` + CSRF (POST triggers CSRF check).
- Rate-limited per authenticated user identity (13 total requests per 600-second window: 10 standard + 3 burst).
- Rate-limit KV key is a SHA-256 hash of the identity: `geocode:v1:rate:<sha256(userId + "\0" + ip)>`. Raw userId and IP never appear in the KV key.
- Results cached in KV (`geocode:v1:<sha256(coords + "\0" + pepper)>`) with TTL from `GEOCODE_CACHE_TTL_SECONDS` (default 172800s / 48h).
- Cache key is HMAC'd with `GEOCODE_CACHE_PEPPER` (secret). Cache stores only `{ "place": "..." }` — no coordinates.
- **No** `LIKE` or `GLOB` — purely coordinate-based reverse geocoding.

### Architecture

1. **Frontend** (`apps/web/src/pages/new-wash.tsx`): Browser Geolocation API provides raw coordinates, sends `POST` with `{ latitude, longitude }` to the API endpoint. Stores only `place` + `capturedAt` in state. Never calls Nominatim directly.
2. **Route** (`apps/api/src/routes/geocode.ts`): Validates `lat`/`lon` bounds with Zod `.strict()`, rate-checks, delegates to service.
3. **Service** (`apps/api/src/services/geocode.ts`): KV cache → LocationIQ primary → Nominatim fallback (through DO).
4. **Durable Object** (`apps/api/src/durable-objects/nominatim-throttle.ts`): Queue-based serialization, enforces ≥1000ms between outbound Nominatim calls. Restart-safe: persists `lastNominatimCallAt` timestamp in DO storage.

### Provider flow

KV cache → LocationIQ (`LOCATIONIQ_BASE_URL`) → globally throttled Nominatim (through `NOMINATIM_THROTTLE` DO) → safe 502 failure (`GEOCODING_UNAVAILABLE`).

- LocationIQ is the primary provider.
- Public Nominatim is fallback only.
- Every Nominatim request goes through the globally named Durable Object (`idFromName("nominatim-global-throttle")`).
- Nominatim calls are spaced ≥1,000ms application-wide, enforced by both in-memory state and persisted DO storage.

### Place formatting

Place strings are constructed from structured address fields only (locality, district, state). `display_name` is never read, stored, cached, or returned by the service or route.

### Coordinate privacy

Coordinates are strictly temporary and must never be:
- Returned in API response bodies.
- Stored in frontend state (only `place` + `capturedAt`).
- Stored in drafts (coordinate-only places are stripped by wizard-draft normalization).
- Stored in KV cache values (only `{ place }`).
- Stored in D1.
- Stored in Durable Object storage.
- Logged (no console.log in any geocode code path).
- Exposed in error messages.

### Rate-limit key privacy

The authenticated user ID and IP address exist temporarily in server memory while the rate-limit identity is hashed via SHA-256. They are never written in readable form to KV, logs, responses, errors, or persistent storage. The final KV key format is `geocode:v1:rate:<sha256(userId + "\0" + ip)>`. The hash provides identifier obscurity, not authentication (the rate limiter is a fairness mechanism, not an access control).

### Cloudflare resources

| Binding | Type | Purpose |
|---------|------|---------|
| `NOMINATIM_THROTTLE` | Durable Object (class `NominatimThrottle`) | Queue-based 1s throttle for Nominatim fallback |
| `GEOCODE_CACHE_PEPPER` | Secret | HMAC key for geocode KV cache keys |
| `GEOCODE_CACHE_TTL_SECONDS` | Var | KV cache TTL (clamped 300–172800) |
| `GEOCODE_USER_AGENT` | Var | User-Agent for LocationIQ requests |
| `LOCATIONIQ_API_KEY` | Secret | LocationIQ API key |
| `LOCATIONIQ_BASE_URL` | Var | LocationIQ endpoint (must be `https://us1.locationiq.com` or `https://eu1.locationiq.com`) |

### Security rules

- `GEOCODE_CACHE_PEPPER` and `LOCATIONIQ_API_KEY` are secrets, never exposed to clients.
- `display_name` from LocationIQ/Nominatim is never used. Only structured address fields (locality/district/state) are extracted.
- Parameterised URL construction — coordinate values are embedded in URL query strings (this is required by the provider API), but never passed to D1.
- Rate limiting prevents abuse (KV-based, 13 requests per 600s window).
- `requireSession` + `requirePermission("wash_jobs.create")` — no unauthenticated or unauthorized geocoding.

### Frontend rules

- `new-wash.tsx` sends coordinates via `api<T>("/api/v1/geocode/reverse", ...)` using `jsonBody({ latitude, longitude })`.
- Only `place` + `capturedAt` are stored in state (`Evidence` type).
- Legacy records show "Legacy location recorded" with safe timestamp on wash-job-detail and customer-detail pages.
- Accuracy, distance, GPS labels, and coordinates are never displayed.
- Live photo is required. Location is optional.
- OSM attribution: "Location data © OpenStreetMap contributors" in app-shell sidebar.

### Draft rules

- `wizard-draft.ts` rejects coordinate-only places via `COORDINATE_ONLY` regex.
- `persistedDraftSchema.refine` strips coordinate-only places.
- `serialize()` removes coordinate-only places before saving.
- `parse()` removes coordinate-only places after loading.
- No latitude, longitude, or accuracy fields exist in any draft type.

### Durable Object restart safety

- `NominatimThrottle` persists `nextAllowedAt` in DO storage (`this.ctx.storage`).
- The timestamp is persisted **before** the Nominatim fetch call, so a crash during the request still reserves the one-second slot.
- On instance restart or eviction, the stored timestamp is loaded (via `blockConcurrencyWhile`) before any requests are processed.
- This guarantees the ≥1000ms spacing survives DO lifecycle events.
- Only a single `number` timestamp is persisted — no coordinates, URLs, User-Agent values, or provider responses.

### Durable Object request handling

- Coordinates may exist temporarily inside the DO request URL while performing the Nominatim fallback call. They are not logged or persisted in DO storage. The DO returns only the provider response to the internal geocoding service for normalization.
- Provider URLs are never logged or stored.
- No automatic provider retry. Provider failure returns 502 immediately.
- Five-second timeout per provider call via `AbortSignal.timeout(5000)`.

### Durable Object deployment

- Wrangler `migrations` block registers `NominatimThrottle` class. Run `wrangler deploy` to create the DO.
- The DO is a single global instance (`idFromName("nominatim-global-throttle")`). No sharding needed at current scale.

### No database changes

No new D1 tables or migrations. The geocode feature is cache-only (KV) with external API fallback.
