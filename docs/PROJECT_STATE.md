# PROJECT_STATE.md — Current WashPro Implementation State

*Last updated: 2026-08-05*

## Active deployments

| Worker | Version ID | Commit |
|--------|------------|--------|
| washpro-web | `097524a0-d436-4ce7-8042-390864fd7825` | `e16f3a8` |
| car-wash | `02567612-9e2b-4107-a936-682f458f3101` | `7fce5c7` |

## Production URL

`https://washpro-web.xpersscarwash.workers.dev`

## Test results (last run: 2026-08-05)

| Package | Test files | Tests | Status |
|---------|-----------|-------|--------|
| @washpro/web | 25 | 525 | ✅ All pass |
| @washpro/api | 28 | 257 | ✅ All pass |
| @washpro/contracts | 1 | 28 | ✅ All pass |
| @washpro/domain | 8 | 53 | ✅ All pass |
| **Total** | **62** | **863** | **✅ All pass** |

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

9. **Refund toggle for payment recording** (deployed, commits `67a1ded`…`8442881`): Refund confirmation UI when recording first payment with refunds, refund locked when `billing_locked_at` set, benefits blocked from create-job API, refunds excluded from benefits eligibility. API worker `car-wash` v4c06f90b, web worker `washpro-web` v3ce9d804.

10. **Report monetary formatting fix** (pending deploy): Reports module displayed raw minor-unit integers (e.g. `695000`) in the browser table, CSV, and PDF exports. Added `REPORT_COLUMNS` metadata (per-report column key/label/type) and shared helpers in `@washpro/domain`: `formatMinorForCsv` (machine-readable `6950.00`, throws on invalid values), `formatMinorForDisplay` (ASCII-safe `INR 6,950.00` fallback for PDF fonts; `—` for invalid), `formatReportLabel`. All three surfaces now use the same metadata: browser (`reports.tsx` + `cell-currency` CSS), CSV (readable headers, quoted text only, major-unit decimals), PDF (metadata columns + org currency from `business.settings`). Profit export now mirrors the browser summary row (`from`/`to`/`revenueMinor`/`expensesMinor`/`netProfitMinor`) instead of the daily financials view. API financial data remains integer minor units.

11. **Customer search by vehicle registration** (not yet deployed): The New Wash customer step now also matches vehicle registration numbers in addition to customer name and phone. `GET /api/v1/customers?search=` normalizes the query with the existing `normalizeRegistration` utility and matches `vehicles.registration_normalized` exactly (case/whitespace/hyphen-insensitive), joined via `EXISTS` (no duplicates, no N+1). Results found by registration carry `matching_registrations` (display registration numbers); the wizard shows them as secondary info. Helper text and placeholder updated on the New Wash customer step. Tenant isolation, permissions, ordering, and LIMIT 100 unchanged.

12. **Payment method card selector + default method setting** (not yet deployed, migration 0018): Record Payment dialog replaced its method dropdown with four PNG radio cards (Cash, UPI, Bank UPI, Paytm) mirroring the vehicle-type selector pattern. New `payment.default_method` business setting (validated against the 4 canonical methods, stored uppercased) is exposed on the session payload as `paymentDefaultMethod` and pre-selects the dialog default with a CASH fallback; Settings page saves it and refreshes the auth context. Contracts now expose `PAYMENT_METHODS` (CASH/UPI/BANK_UPI/PAYTM), `LEGACY_PAYMENT_METHODS` (CARD/BANK_TRANSFER/OTHER), and `PAYMENT_METHOD_LABELS`; the `payments` table CHECK constraint and `paymentInputSchema` accept only canonical methods while legacy rows stay readable and label-mapped (Payments list and Customer detail). Migration 0018 required a `DROP TRIGGER IF EXISTS tr_refunds_not_over_payment` workaround before the payments table rebuild because workerd reparses surviving triggers referencing the renamed table. Expenses keeps its own separate payment-method flow. 646 automated tests pass.

13. **Manual discount toggle** (not yet deployed): New boolean business setting `payment.manual_discount_enabled` (default `false`) gates the manual discount feature. When off, the Record Payment dialog hides the Manual discount / Manual discount reason fields and the server rejects positive manual discounts on `POST /wash-jobs/:id/verify-benefits` and `POST /payments` with `403 MANUAL_DISCOUNT_DISABLED`. The setting is exposed on the session payload as `manualDiscountEnabled`; the Settings page renders it as "Allow manual discounts" (label override in the business group). No migration required — `business_settings` is a generic key/value table. 669 automated tests pass.

14. **Hybrid admin/staff auth mode** (not yet deployed): New production `AUTH_MODE=hybrid_admin_staff` (now the `wrangler.jsonc` default) lets staff accounts sign in through the PBKDF2 database path while the static administrator keeps `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` login. The static-admin identifier is reserved and cannot be shadowed by a DB user. Legacy 600,000-iteration hashes (from before the `beca3fd` PBKDF2 fix) fail safely with the generic invalid-credentials error and require an authorized reset. Static-admin sessions are blocked from change-password (`403 STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY` — the password is managed through the deployment secret); database users keep the normal verified 100,000-iteration change flow. `validate-production-deploy.mjs` accepts both `AUTH_MODE` values. 13 new integration tests in `apps/api/test/hybrid-auth.test.ts`.

15. **Typography system — Geist / Inter / Geist Mono** (deployed 2026-08-04, commit `b98d012`, web worker `dcfe6bae-9da3-4706-ad08-492fe28bffb4`): Locally bundled fonts via `@fontsource/geist`, `@fontsource/geist-mono`, `@fontsource/inter` (WOFF2, `font-display: swap`, CSP `font-src 'self'` compatible). CSS variables `--font-heading`/`--font-body`/`--font-mono` in `styles.css`, plus utility classes `.font-heading`/`.font-body`/`.font-mono`/`.numeric-value` and semantic `.identifier`/`.identifier--muted` (Geist Mono 500/400). Geist on h1–h6, buttons, tabs, nav, badges, labels, table headers; Inter on body/inputs (explicit `font-family: var(--font-body)` on form controls); Geist Mono on vehicle registrations, job/invoice numbers, transaction refs, coupon/referral codes, expense/service codes, audit record IDs/IPs, registration/code inputs. `tabular-nums` on amounts, totals, dates (via `td`), dashboard KPIs, timers. No `* { font-family }` selector. `build.assetsInlineLimit: 0` in `vite.config.ts` forces all 62 font subsets to emit as same-origin `/assets/*.woff2` files (Vite's default 4 KB inline limit produced `data:` URIs that CSP `font-src 'self'` would block). All 779 tests pass.

16. **Customer vehicle photos** (deployed 2026-08-04, commit `44c216a`, api `e605f58f-2796-4cf7-a72d-f7e6cca4b892`, web `7f3ed1a3-53f5-4d6b-bea1-f8e11a6fb9fe`): Enhanced `GET /customers/:id/history` to include enriched vehicle photos from wash jobs — size (via `file_assets.size`), registration number, make/model, job reference, captured timestamp, photo type, and mime type. New `GET /api/v1/uploads/photos/:id` serves authenticated photo bytes with organization-scoped ownership checks. `VehiclePhotosCard` component on customer detail page groups photos by vehicle registration, shows newest first within each group, and supports broken-image fallback and lightbox preview via existing `Dialog`. `formatBytes()` utility for human-readable file sizes. 22 new tests across API (10) and web (12) — all 801 tests pass. Global `cache-control: no-store` middleware applies; route sets only `Content-Type`.

17. **Photo capture-place display** (deployed 2026-08-04, commit `7fce5c7`, api `02567612-9e2b-4107-a936-682f458f3101`, web `dd35a92c-9b54-4ac9-b7ed-324c7408e47f`): Each vehicle-photo card on the Customer Profile now shows the reverse-geocoded capture place from `wash_jobs.location_place` (existing column, existing JOIN). Place displays between date/time and file size with a MapPin icon, only when non-null. No browser reverse-geocoding, no coordinates exposed, no customer-address fallback. 4 new tests (api 1, web 3) including a broken-thumbnail place-survival regression test — all 805 tests pass.

18. **Wash queue Assigned staff column** (not yet deployed): The queue page replaced the "Service" column with "Assigned staff", rendering `wash_jobs.assigned_user_name_snapshot` (already returned by the existing `SELECT *` list query — no backend change). Rows with a null/blank snapshot display muted "Unassigned". Long names clamp to two lines via `.queue-assignee` CSS. 13 new page tests in `apps/web/src/pages/wash-jobs.test.tsx` covering header swap, assigned/unassigned rendering, no staff-ID leak, snapshot names, and preserved search/filter/refresh/navigation behavior.

19. **Payments Assigned staff column** (not yet deployed): The Payments listing added an "Assigned staff" column between "Customer & vehicle" and "Method", rendering the related wash job's `assigned_user_name_snapshot`. `GET /api/v1/payments` now selects `w.assigned_user_name_snapshot` (single JOIN, no N+1, org/branch isolation unchanged). Rows with a null/blank/whitespace snapshot display muted "Unassigned"; long names clamp to two lines via `.payment-assignee` (shares the queue assignee clamp CSS). Multiple payments for one job each show the same snapshot. 16 new page tests in `apps/web/src/pages/payments.test.tsx` and 1 new API integration test in `apps/api/test/wash-payments.test.ts` (with a dedicated `asset-live-wash-4` fixture — photo assets are single-use per job).

20. **Payments admin filters: date range + assigned staff** (not yet deployed): `GET /api/v1/payments` accepts optional `from`, `to` (validated with `z.iso.date()`, business-local day boundaries via the `business.timezone` setting, default `Asia/Kolkata`, `to` day exclusive) and `assignedUserId` (stable staff ID). The `UNASSIGNED` sentinel was removed because `wash_jobs.assigned_user_id` is `NOT NULL` and can never be unassigned. Any filter parameter requires `ADMIN` (403 `AUTH_PERMISSION_DENIED` for staff), and the staff ID is verified against the requesting org+branch (404 `RESOURCE_NOT_FOUND`). Unfiltered access still only needs `payments.create`. The new admin-only `GET /api/v1/payments/filter-options` endpoint returns org+branch staff (name + active flag, disabled included). The Payments page renders an admin-only filter toolbar (From, To, Assigned staff select with All staff and real staff options, Apply filters and Clear filters buttons) driving the `useApiData` URL via `useSearchParams`; staff always get the unfiltered `/payments`. No default range; filters sync to the URL only when applied. Filter identity uses `assigned_user_id`; display uses `assigned_user_name_snapshot`. Rows with a null/blank/whitespace snapshot defensively display muted "Unassigned". `.payments-filters` CSS grid replaces the old `.filters-form .filters-actions` row. 6 new API integration tests and 8 new web page tests added.

21. **New Wash location is mandatory** (not yet deployed): Step 4 "Live photo & location" now requires both a live photo and a reverse-geocoded location place before the wizard can advance. Shared `hasCompleteEvidence()` rule (photoAssetId + non-blank place + capturedAt) drives the Continue button, a new `goNext()` navigation guard (with a location-error message shown in a lifted `locationError` state), and the Save draft / Create job guard. The create-job payload always sends the trimmed place and capturedAt once complete; `createJobSchema` in `apps/api/src/routes/wash-jobs.ts` now requires `location` with required `place` (trimmed, 1–500 chars, `COORDINATE_ONLY` rejected) and `capturedAt` (ISO datetime) for every initial status including DRAFT, and the write path uses the validated values directly. `wash_jobs.location_place` stays nullable so historical rows remain readable — no migration. Location error copy uses distinct messages (permission denied "Location permission is required to continue."; general failure "Unable to capture your location. Please try again."; reverse-geocode failure "Unable to determine a readable place. Please try again."); "Capturing location…" status text shows while pending. 15 new API tests (10 in `first-payment-benefits.test.ts` — added 6 location-required cases and valid `location` fields to the 7 strict-schema fixtures — plus the existing pool was enlarged from 50 to 64 single-use photo assets to absorb the extra creations) and 12 new web tests in `new-wash.test.tsx`. All 901 automated tests pass.

## Known issues

1. **Invoice browser navigation**: Browser navigation to `/invoice/<token>` serves the SPA instead of the API invoice page. Caused by `compatibility_date ≥ 2025-04-01` routing navigations to asset serving. The `assets_navigation_has_no_effect` compatibility flag may resolve this but requires production testing. `run_worker_first` array form caused HTTP 405 regressions in Wrangler 4.114 and was removed.

2. **Cloudflare Git integration**: Auto-deploy on push may overwrite manually deployed Workers. The integration configuration in the Cloudflare Dashboard should be verified to use correct `pnpm`-based build commands.

3. ~~**ALLOWED_ORIGINS mismatch**~~ **Resolved**: Updated to `https://washpro-web.xpersscarwash.workers.dev` (Wrangler `vars` env var, not a secret). API redeployed `192b4281`.

## Resolved: Server-side reverse geocoding (deployed 2026-07-29)

Replaced browser-side Nominatim reverse geocoding with `POST /api/v1/geocode/reverse` endpoint using LocationIQ primary + Nominatim fallback through crash-safe Durable Object throttle. All 14 deployment preflight checks pass. 328 automated tests (66 API + 226 web + 32 domain + 4 contracts).

New infrastructure:
- `NominatimThrottle` Durable Object (queue-based FIFO, ≥1s spacing, crash-safe with persisted `nextAllowedAt`)
- `geocode.ts` service (KV cache → LocationIQ → Nominatim DO fallback)
- `rate-limit.ts` KV rate limiter (13/600s per user+IP, hashed identity keys)
- `geocode.ts` route with Zod validation, permission, and CSRF checks
- Frontend: `new-wash.tsx` POSTs coordinates via `api()`, stores only `place`+`capturedAt`
- Legacy location display: "Legacy location recorded" with safe timestamp
- OSM attribution in sidebar
- DO migration corrected to `new_sqlite_classes` for Cloudflare free plan
- Secrets `LOCATIONIQ_API_KEY` and `GEOCODE_CACHE_PEPPER` confirmed on API Worker

## Current archive configuration

- **Web Worker**: `binding: "ASSETS"`, SPA `not_found_handling`, service binding `API → car-wash`
- **API Worker**: `workers_dev: false`, `AUTH_MODE: static_admin`, `APP_ENV: production`
- **No `run_worker_first`** — removed due to incompatibility with Wrangler 4.114
- **Frontend**: relative API URLs (`/api/v1/...`), CSRF protection, session-based auth
- **Staff workflow**: dialog confirmations, password reset with two fields, no reason prompts
