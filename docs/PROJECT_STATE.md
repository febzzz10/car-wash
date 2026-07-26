# PROJECT_STATE.md — Current WashPro Implementation State

*Last updated: 2026-07-26*

## Active deployments

| Worker | Version ID | Commit |
|--------|------------|--------|
| washpro-web | `b8836551-31d7-4fa1-844a-4b0b0e376787` | `e23753c` |
| car-wash | `964bd4c1-42d6-48c7-9802-ece10afd23ec` | `e23753c` |

## Production URL

`https://washpro-web.xpersscarwash.workers.dev`

## Test results (last run `e23753c`)

| Package | Test files | Tests | Status |
|---------|-----------|-------|--------|
| @washpro/web | 6 | 24 | ✅ All pass |
| @washpro/api | 12 | 20 | ✅ All pass |
| @washpro/contracts | 1 | 4 | ✅ All pass |
| @washpro/domain | 9 | 30 | ✅ All pass |
| **Total** | **28** | **78** | **✅ All pass** |

## TypeScript typecheck

All packages: ✅ 0 errors

## Recently resolved issues

1. **SPA routing (error 1101)**: Fixed by adding `binding: "ASSETS"` to web Worker config and using canonical `env.ASSETS.fetch(request)` pattern. Service binding to API correctly forwards all request types (JSON, multipart, binary) via `env.API.fetch(new Request(request.url, request))`.

2. **Staff reason prompts removed** (`e23753c`): Administrators no longer need to enter reasons when disabling/enabling staff, resetting passwords, or revoking sessions. Dialog-based confirmation and password-reset UI replaces `window.prompt()`/`window.confirm()`. Audit logs use system-generated reasons.

3. **API typecheck errors fixed**: 17 pre-existing TS errors resolved — `timingSafeEqual` type assertion, Hono `Context` typing, D1 `.first()` return type, array index assertions in tests, vitest `APP_ENV` override.

## Known issues

1. **Invoice browser navigation**: Browser navigation to `/invoice/<token>` serves the SPA instead of the API invoice page. Caused by `compatibility_date ≥ 2025-04-01` routing navigations to asset serving. The `assets_navigation_has_no_effect` compatibility flag may resolve this but requires production testing. `run_worker_first` array form caused HTTP 405 regressions in Wrangler 4.114 and was removed.

2. **Cloudflare Git integration**: Auto-deploy on push may overwrite manually deployed Workers. The integration configuration in the Cloudflare Dashboard should be verified to use correct `pnpm`-based build commands.

## Current archive configuration

- **Web Worker**: `binding: "ASSETS"`, SPA `not_found_handling`, service binding `API → car-wash`
- **API Worker**: `workers_dev: false`, `AUTH_MODE: static_admin`, `APP_ENV: production`
- **No `run_worker_first`** — removed due to incompatibility with Wrangler 4.114
- **Frontend**: relative API URLs (`/api/v1/...`), CSRF protection, session-based auth
- **Staff workflow**: dialog confirmations, password reset with two fields, no reason prompts
