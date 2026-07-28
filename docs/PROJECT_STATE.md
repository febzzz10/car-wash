# PROJECT_STATE.md — Current WashPro Implementation State

*Last updated: 2026-07-28*

## Active deployments

| Worker | Version ID | Commit |
|--------|------------|--------|
| washpro-web | `8556f5d7-0a9e-4afb-8353-c14a0333eda0` | (uncommitted) |
| car-wash | `192b4281-108f-47a5-8caa-6eca62ce0177` | (uncommitted) |

## Production URL

`https://washpro-web.xpersscarwash.workers.dev`

## Test results (last run uncommitted)

| Package | Test files | Tests | Status |
|---------|-----------|-------|--------|
| @washpro/web | 12 | 191 | ✅ All pass |
| @washpro/api | 13 | 21 | ✅ All pass |
| @washpro/contracts | 1 | 4 | ✅ All pass |
| @washpro/domain | 9 | 31 | ✅ All pass |
| **Total** | **35** | **247** | **✅ All pass** |

## TypeScript typecheck

All packages: ✅ 0 errors

## Recently resolved issues

1. **SPA routing (error 1101)**: Fixed by adding `binding: "ASSETS"` to web Worker config and using canonical `env.ASSETS.fetch(request)` pattern. Service binding to API correctly forwards all request types (JSON, multipart, binary) via `env.API.fetch(new Request(request.url, request))`.

2. **Staff reason prompts removed** (`e23753c`): Administrators no longer need to enter reasons when disabling/enabling staff, resetting passwords, or revoking sessions. Dialog-based confirmation and password-reset UI replaces `window.prompt()`/`window.confirm()`. Audit logs use system-generated reasons.

3. **API typecheck errors fixed**: 17 pre-existing TS errors resolved — `timingSafeEqual` type assertion, Hono `Context` typing, D1 `.first()` return type, array index assertions in tests, vitest `APP_ENV` override.

4. **Expense cancellation dialog** (`21222e8`): Replaced `window.prompt()` for expense cancellation reason with a styled `CancelExpenseDialog`. Matches customer/vehicle dialog patterns. `minLength=5` matches backend schema.

5. **Invoice correction dialog** (not yet deployed): Replaced two `window.prompt()` calls for invoice correction reason and customer name with a single `InvoiceRevisionDialog` containing reason textarea and pre-filled customer name input.

6. **Vehicle-type consolidation** (`ef28b0c`, migration 0011): Replaced 9 legacy types (SUV, SEDAN, etc.) with 3 canonical codes (TWO_WHEELER, THREE_WHEELER, FOUR_WHEELER). Applied to production D1 via step-by-step SQL. Removed `BEGIN TRANSACTION`/`COMMIT` from migration file for D1 remote compatibility. Had to drop `tr_invoices_issued_no_update` trigger temporarily to clear self-referencing FK on invoice revisions. API deployed `52426036-9b15-473a-a564-7f00a1336cf3`, web deployed `8b31c071-3f74-4e28-af1b-115bfbc48794`.

7. **Vehicle-type PNG icons** (`570b81f`): Replaced Lucide SVG icons for vehicle types with PNG images (two-wheeler, three-wheeler, four-wheeler). Baked into Vite build, served from Worker assets.

8. **Vehicle model autocomplete** (migration 0012, fully production-verified): New `vehicle_models` D1 table with `UNIQUE(organization_id, normalized_name)`. `GET /api/v1/vehicle-models` endpoint with safe prefix range matching. Reusable `VehicleModelAutocomplete` component with ARIA combobox pattern. Auto-upserts model on successful vehicle create/update. Backfill script for existing data. Authenticated Add Vehicle, Edit Vehicle, keyboard navigation, duplicate handling, API failure fallback, case-insensitive matching, and organization isolation all verified in production.

## Known issues

1. **Invoice browser navigation**: Browser navigation to `/invoice/<token>` serves the SPA instead of the API invoice page. Caused by `compatibility_date ≥ 2025-04-01` routing navigations to asset serving. The `assets_navigation_has_no_effect` compatibility flag may resolve this but requires production testing. `run_worker_first` array form caused HTTP 405 regressions in Wrangler 4.114 and was removed.

2. **Cloudflare Git integration**: Auto-deploy on push may overwrite manually deployed Workers. The integration configuration in the Cloudflare Dashboard should be verified to use correct `pnpm`-based build commands.

3. ~~**ALLOWED_ORIGINS mismatch**~~ **Resolved**: Updated to `https://washpro-web.xpersscarwash.workers.dev` (Wrangler `vars` env var, not a secret). API redeployed `192b4281`.

## Current archive configuration

- **Web Worker**: `binding: "ASSETS"`, SPA `not_found_handling`, service binding `API → car-wash`
- **API Worker**: `workers_dev: false`, `AUTH_MODE: static_admin`, `APP_ENV: production`
- **No `run_worker_first`** — removed due to incompatibility with Wrangler 4.114
- **Frontend**: relative API URLs (`/api/v1/...`), CSRF protection, session-based auth
- **Staff workflow**: dialog confirmations, password reset with two fields, no reason prompts
