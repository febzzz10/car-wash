# DECISIONS.md — WashPro Architectural Decisions

## 2026-08-02: Hybrid admin/staff authentication mode for production

**Decision**: Add a `hybrid_admin_staff` production auth mode so staff accounts (PBKDF2-hashed in D1) can sign in alongside the static administrator. The static-admin identifier (`ADMIN_LOGIN_EMAIL`) is reserved: login attempts with that identifier always use the static admin credentials and can never be shadowed by a database user. `wrangler.jsonc` now defaults `AUTH_MODE` to `hybrid_admin_staff`.

**Rationale**: The previous decision (2026-07-25) restricted production to `static_admin`, which prevented staff from signing in. Production staff accounts exist in D1 with PBKDF2 hashes; the hybrid mode routes non-admin identifiers through the existing PBKDF2 login path unchanged (lookup, verification, status checks, tenant-scoped sessions), preserving all session/cookie/CSRF/rate-limit/audit behaviour.

**Impact**:
- `isStaticAdminMode()` and new `isHybridAdminStaffMode()` dispatch in `apps/api/src/routes/auth.ts`; constants `AUTH_MODE_STATIC_ADMIN` / `AUTH_MODE_HYBRID_ADMIN_STAFF`
- `validate-production-deploy.mjs` accepts both `AUTH_MODE` values
- Legacy 600,000-iteration hashes (pre-`beca3fd`) fail safely with the generic invalid-credentials error and require an authorized reset
- Static-admin sessions are blocked from change-password (`403 STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY`); the static-admin password is managed exclusively through the `ADMIN_LOGIN_PASSWORD` deployment secret
- 13 new integration tests in `apps/api/test/hybrid-auth.test.ts`

## 2026-07-25: Static-admin authentication mode for production

**Decision**: Use `static_admin` mode instead of PBKDF2-based multi-user auth in production.

**Rationale**: The project has a single administrator (`xpersscarwash@gmail.com`). The `static_admin` mode verifies the single admin's email and password directly against environment variables and secrets, without requiring a D1 user lookup for the initial authentication step. This simplifies deployment since the single admin account only needs the `ADMIN_LOGIN_PASSWORD` secret set on the API Worker.

**Impact**: 
- The `isStaticAdminMode()` function checks `APP_ENV === "production" && AUTH_MODE === "static_admin"`
- Vitest config sets `APP_ENV: "test"` to use the PBKDF2 path in tests
- Staff accounts still use PBKDF2-hashed passwords in D1
- The admin user record in D1 must exist with `email_normalized` matching `ADMIN_LOGIN_EMAIL`

## 2026-07-25: Service-binding architecture for API privacy

**Decision**: Deploy the API as a private Worker (`workers_dev: false`), accessed only through a service binding from the public web Worker.

**Rationale**: The API Worker must not be publicly accessible. Using a Cloudflare service binding instead of a public URL eliminates the attack surface of a public API endpoint and removes the need for CORS configuration on the API side. All API requests appear same-origin to the browser.

**Impact**: 
- `car-wash` has `workers_dev: false` permanently
- `washpro-web` has `services: [{binding: "API", service: "car-wash"}]`
- Frontend must use relative URLs (`/api/v1/...`), never a direct hostname
- CSP `connect-src 'self'` is sufficient

## 2026-07-25: Vite plugin for Worker bundling

**Decision**: Use `@cloudflare/vite-plugin` to build the web Worker and generate deployment configuration.

**Rationale**: The Vite plugin integrates the Vite dev server with Wrangler, provides HMR during development, and generates the `dist/washpro_web/wrangler.json` deployment config automatically from the source `wrangler.jsonc`.

**Impact**:
- Web deploy command: `pnpm --dir apps/web exec wrangler deploy --config dist/washpro_web/wrangler.json`
- The plugin sets `no_bundle: true` and points `main` to the pre-built `index.js`
- Generated config might differ from the source in non-obvious ways — always verify

## 2026-07-26: Remove `run_worker_first` from web Worker config

**Decision**: Remove the `run_worker_first: ["/api/*", "/invoice/*"]` array from the web Worker config.

**Rationale**: In Wrangler 4.114, the `run_worker_first` array form caused HTTP 405 responses on POST requests. The exact cause was not conclusively identified. Removing `run_worker_first` restores correct behaviour for API proxy requests. The standard routing path (non-navigation requests → Worker, navigation requests → asset serving) handles most cases correctly.

**Impact**:
- Browser navigation to `/invoice/<token>` serves the SPA (asset serving) instead of the API invoice page
- This gap may be resolved with the `assets_navigation_has_no_effect` compatibility flag, pending production testing

## 2026-07-26: Remove reason requirements from staff admin actions

**Decision**: No longer require administrators to enter a free-text reason when enabling/disabling staff accounts, resetting passwords, or revoking sessions.

**Rationale**: The manual reason prompts added friction without meaningful security benefit. Confirmation dialogs provide sufficient guard against accidental actions. Audit logs still record every action with system-generated descriptions.

**Impact**:
- `statusSchema`: `reason` made optional (was required, min 5 chars)
- `resetSchema`: `reason` removed (was required)
- Audit log reasons: `"Account disabled by administrator"`, `"Account enabled by administrator"`, `"Password changed by administrator"`, `"ADMIN_REVOCATION"`
- All `window.prompt()`/`window.confirm()` calls removed from staff page
- Replaced with `Dialog`-based confirmation and password-reset UI

## 2026-07-26: API Worker deployment to fix service-binding 1101 errors

**Decision**: Redeploy the API Worker from the current repository code when service-binding calls produce infrastructure-level 1101 errors.

**Rationale**: The exact Cloudflare platform condition was not conclusively identified, but redeploying the API Worker restored correct service-binding responses. The previous deployment version did not appear in standard `wrangler versions list`, suggesting a non-standard deployment artifact.

**Impact**: The API must be redeployed alongside the web Worker during any deployment cycle to ensure both Workers run compatible code.
