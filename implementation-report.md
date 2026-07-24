# WashPro Implementation Report

## Summary

WashPro was implemented from a documentation-only repository as a strict TypeScript monorepo. The application uses a React 19/Vite Cloudflare Pages frontend, a Hono Cloudflare Worker API, D1 for authoritative relational data, separate private R2 bindings for uploads and invoice PDFs, and KV only for short-lived camera challenges/cache state.

Completed modules include secure Admin/Staff authentication and permissions, Staff management, customer/vehicle histories, services and price history, the state-preserving live-camera/GPS New Wash wizard, status/timer workflows, server billing, coupons, referrals/rewards, partial payments/refunds, immutable PDF invoices/revisions/WhatsApp fallbacks, expenses/categories, dashboard/reports/exports, business settings, scheduled retention/reconciliation, protected private files, and append-only audit records.

Requirement-by-requirement evidence is in `requirements-traceability.md`. The initial empty-repository status and documentation decisions are in `docs/requirements-audit.md`.

## Architecture Used

- `apps/web`: React 19, React Router, Vite, custom responsive design system and lazy page bundles.
- `apps/api`: Cloudflare Worker with Hono, prepared D1 statements, D1 batches, R2, KV, scheduled maintenance, `pdf-lib`.
- `packages/contracts`: shared Zod validation and enumerations.
- `packages/domain`: pure domain rules for billing, coupons, referrals, timers, GPS, payments, permissions, normalization and accounting.
- Vitest with Cloudflare Workers pool for unit/integration/security tests; Playwright for multi-browser responsive E2E.

## Files Changed

The starting repository contained only `plan.md`, `prd.md`, `appflow.md`, `techspec.md`, `database.md`, and `design.md`, with no Git metadata. Those six source documents were read completely and not modified. Every project file below was created. No project file was removed.

Generated/ignored local artifacts are not source files: `node_modules`, `apps/api/.dev.vars` (random local secrets), `.wrangler`, `apps/api/.tmp`, `apps/*/dist`, `output`, `playwright-report`, and `test-results`.

### Root and documentation

- `.gitignore`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.base.json`
- `eslint.config.js`
- `playwright.config.ts`
- `requirements-traceability.md`
- `implementation-report.md`
- `docs/requirements-audit.md`
- `docs/superpowers/plans/2026-07-23-washpro-complete-application.md`
- `docs/setup.md`
- `docs/testing.md`
- `docs/deployment.md`
- `docs/backup-restore.md`
- `scripts/setup-local-env.mjs`
- `scripts/generate-invoice-preview.ts`
- `e2e/washpro.spec.ts`

### Shared contracts

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/enums.ts`
- `packages/contracts/src/schemas.ts`
- `packages/contracts/src/schemas.test.ts`

### Domain package

- `packages/domain/package.json`
- `packages/domain/tsconfig.json`
- `packages/domain/src/index.ts`
- `packages/domain/src/billing.ts`
- `packages/domain/src/billing.test.ts`
- `packages/domain/src/coupons.ts`
- `packages/domain/src/coupons.test.ts`
- `packages/domain/src/location.ts`
- `packages/domain/src/location.test.ts`
- `packages/domain/src/normalization.ts`
- `packages/domain/src/normalization.test.ts`
- `packages/domain/src/payments.ts`
- `packages/domain/src/payments.test.ts`
- `packages/domain/src/permissions.ts`
- `packages/domain/src/permissions.test.ts`
- `packages/domain/src/referrals.ts`
- `packages/domain/src/referrals.test.ts`
- `packages/domain/src/reports.ts`
- `packages/domain/src/reports.test.ts`
- `packages/domain/src/timers.ts`
- `packages/domain/src/timers.test.ts`

### Worker configuration and migrations

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/vitest.config.ts`
- `apps/api/wrangler.jsonc`
- `apps/api/migrations/0001_foundation.sql`
- `apps/api/migrations/0002_customers_and_vehicles.sql`
- `apps/api/migrations/0003_services_and_wash_jobs.sql`
- `apps/api/migrations/0004_photo_gps_and_timer.sql`
- `apps/api/migrations/0005_coupons_and_referrals.sql`
- `apps/api/migrations/0006_payments_and_invoices.sql`
- `apps/api/migrations/0007_expenses_and_audit.sql`
- `apps/api/migrations/0008_reporting_indexes_and_views.sql`
- `apps/api/migrations/0009_integrity_guards.sql`

### Worker source

- `apps/api/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/types.ts`
- `apps/api/src/env.d.ts`
- `apps/api/src/http/errors.ts`
- `apps/api/src/http/request.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/security/encoding.ts`
- `apps/api/src/security/passwords.ts`
- `apps/api/src/security/tokens.ts`
- `apps/api/src/services/audit.ts`
- `apps/api/src/services/invoice-pdf.ts`
- `apps/api/src/services/maintenance.ts`
- `apps/api/src/services/report-pdf.ts`
- `apps/api/src/services/settings.ts`
- `apps/api/src/routes/audit.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/bootstrap.ts`
- `apps/api/src/routes/coupons.ts`
- `apps/api/src/routes/customers.ts`
- `apps/api/src/routes/expenses.ts`
- `apps/api/src/routes/invoices.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/routes/referrals.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/routes/services.ts`
- `apps/api/src/routes/settings.ts`
- `apps/api/src/routes/uploads.ts`
- `apps/api/src/routes/users.ts`
- `apps/api/src/routes/vehicles.ts`
- `apps/api/src/routes/wash-jobs.ts`

### Worker tests

- `apps/api/test/apply-migrations.ts`
- `apps/api/test/env.d.ts`
- `apps/api/test/auth.test.ts`
- `apps/api/test/bootstrap.test.ts`
- `apps/api/test/customers-vehicles.test.ts`
- `apps/api/test/expenses-reports.test.ts`
- `apps/api/test/invoices.test.ts`
- `apps/api/test/migrations.test.ts`
- `apps/api/test/promotions-admin.test.ts`
- `apps/api/test/settings-maintenance.test.ts`
- `apps/api/test/staff-management.test.ts`
- `apps/api/test/uploads.test.ts`
- `apps/api/test/wash-payments.test.ts`

### Web configuration and public controls

- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/public/_headers`
- `apps/web/public/_redirects`
- `apps/web/public/robots.txt`

### Web source and tests

- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/auth.tsx`
- `apps/web/src/types.ts`
- `apps/web/src/styles.css`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/toast.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/hooks/use-api-data.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/format.ts`
- `apps/web/src/lib/format.test.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/navigation.test.ts`
- `apps/web/src/lib/setup-docs.test.ts`
- `apps/web/src/lib/wizard-draft.ts`
- `apps/web/src/lib/wizard-draft.test.ts`
- `apps/web/src/test/setup.ts`
- `apps/web/src/pages/account.tsx`
- `apps/web/src/pages/audit.tsx`
- `apps/web/src/pages/coupons.tsx`
- `apps/web/src/pages/customer-detail.tsx`
- `apps/web/src/pages/customers.tsx`
- `apps/web/src/pages/dashboard.tsx`
- `apps/web/src/pages/expenses.tsx`
- `apps/web/src/pages/invoice-detail.tsx`
- `apps/web/src/pages/invoices.tsx`
- `apps/web/src/pages/login.tsx`
- `apps/web/src/pages/new-wash.tsx`
- `apps/web/src/pages/payments.tsx`
- `apps/web/src/pages/referrals.tsx`
- `apps/web/src/pages/reports.tsx`
- `apps/web/src/pages/services.tsx`
- `apps/web/src/pages/settings.tsx`
- `apps/web/src/pages/staff.tsx`
- `apps/web/src/pages/vehicle-detail.tsx`
- `apps/web/src/pages/vehicles.tsx`
- `apps/web/src/pages/wash-job-detail.tsx`
- `apps/web/src/pages/wash-jobs.tsx`

## Database

### Migrations added

1. `0001_foundation.sql`: organizations, branches, typed settings, sequences, idempotency, file metadata, users/sessions/login/reset records.
2. `0002_customers_and_vehicles.sql`: customers, vehicle types, vehicles, normalized uniqueness and ownership fields.
3. `0003_services_and_wash_jobs.sql`: services, effective vehicle prices, wash jobs/items and immutable financial snapshots.
4. `0004_photo_gps_and_timer.sql`: photos, GPS captures, timer events/adjustments and append-only guards.
5. `0005_coupons_and_referrals.sql`: coupon eligibility/redemption and referral code/redemption/reward ledger.
6. `0006_payments_and_invoices.sql`: append-only payments/refunds and immutable invoice snapshots/items/revisions.
7. `0007_expenses_and_audit.sql`: expense categories/transactions/attachments and append-only audit logs.
8. `0008_reporting_indexes_and_views.sql`: reporting/search indexes and three reconciliation/accounting views.
9. `0009_integrity_guards.sql`: tenant/branch, timer, coupon, payment/refund, private-asset and audit-sensitive-data triggers.

The schema adds 38 tables, 41 explicit indexes (including partial unique indexes), 3 views, and 29 integrity/immutability triggers. Primary/foreign/unique/check constraints, normalized search fields, optimistic `version` fields, snapshot columns, idempotency records, and immutable financial/history guards are included.

### Clean migration result

`wrangler 4.113.0` applied all nine migrations to an empty isolated local D1 persistence path. Every migration reported `✅`; zero migration failures occurred. The ordinary persisted local D1 also reported “No migrations to apply.”

### Seed/bootstrap data

One-time protected bootstrap creates one organization, one branch, one Administrator, nine documented vehicle types, ten documented expense categories, and typed defaults. It embeds no reusable password or business coordinate. Tax and referrals default disabled until configured. A replay is rejected. No fake customer, job, payment, expense or invoice data is seeded.

### Data corrections

There was no pre-existing database. During implementation, bootstrap defaults were aligned with `database.md`: missing MUV/pickup/commercial vehicle types and expense categories were added, and unapproved tax/referral enablement was removed.

## Tests

Final verification date: 2026-07-24.

| Gate | Exact result |
| --- | --- |
| Formatting | `npm run format:check`: passed; all matched source files use Prettier style. |
| Lint | `npm run lint`: passed; 0 errors, 0 warnings. |
| Type checking | `npm run typecheck`: passed in API, web, contracts and domain workspaces. |
| Worker integration/security | 11 files passed, 19 tests passed, 0 failed. |
| Web unit | 4 files passed, 7 tests passed, 0 failed. |
| Contract unit | 1 file passed, 4 tests passed, 0 failed. |
| Domain unit | 9 files passed, 30 tests passed, 0 failed. |
| Vitest total | 25 files passed, 60 tests passed, 0 failed. |
| Playwright | 16 passed, 4 intentionally skipped duplicate media runs, 0 failed, 26.8 seconds. |
| Clean D1 migration | 9/9 migrations passed from empty state. |
| Production dependency audit | 0 vulnerabilities across production dependencies. |
| Full dependency audit | 4 high, 0 critical: development-only Wrangler/Miniflare chain through `sharp@0.34.5`. |

Playwright projects were Chromium desktop (1440×900), Pixel 7 emulation, Galaxy Tab S4 emulation, Firefox desktop (1440×900), and iPhone 15 WebKit emulation. Shared login, role routing and no-horizontal-overflow flows ran across all projects. The complete camera/GPS New Wash flow ran in Chromium desktop and was deliberately skipped in the other four projects to avoid duplicating one media workflow.

One interim invoice-token test failed because the test attempted to update an issued invoice; the immutability trigger correctly rejected it. The test was corrected to advance the clock, then the targeted test and complete suite passed. Initial sandboxed Vite/esbuild launches were denied by the host filesystem sandbox and were rerun with approved execution; this was an environment restriction, not a product test failure.

Physical Android/iPhone/iPad, Windows 10/11, and macOS hardware were not available. Those checks are not falsely marked passed; `docs/testing.md` contains the launch checklist.

## Security

Implemented controls:

- PBKDF2-SHA256 passwords with per-password salt, server pepper and password policy.
- Random sessions stored only as hashes; Secure/HttpOnly/SameSite=Strict cookies, expiry, revoke and disabled/locked account handling.
- Exact-origin and derived per-session CSRF enforcement for mutations.
- Backend role and granular permission checks, organization/branch-scoped prepared queries and database scope triggers.
- Login throttling/lock handling and login-attempt records.
- Zod input contracts, size/type/signature file validation, safe error envelopes and sensitive audit redaction.
- Private R2 object access; photos have database public-access guards, invoice PDFs use expiring HMAC-bound links.
- Append-only payments, refunds, timer events, reward ledger and audits; issued invoice/update/delete database guards.
- Idempotency keys and unique constraints for duplicate job/payment/invoice/reward/expense requests.
- CSP, HSTS, anti-framing, no-sniff, referrer and scoped camera/geolocation Permissions Policy headers.
- No plain passwords, raw session tokens, UPI PINs or full card data in production storage or logs.

`npm audit --omit=dev` reports zero production vulnerabilities. The full audit reports four high-severity entries in the current latest Cloudflare development tooling: `@cloudflare/vitest-pool-workers@0.18.7`, `wrangler@4.113.0`, `miniflare@4.20260721.0`, and their pinned `sharp@0.34.5`. The registry reports `sharp@0.35.3`, but current Miniflare pins `0.34.5`; forcing an untested override was not done. This tool chain is not in the deployed Worker or web runtime bundle. Monitor Cloudflare releases and upgrade when it adopts a fixed compatible `sharp`.

## Build

- Worker dry run passed with Wrangler 4.113.0: 1745.75 KiB upload, 368.75 KiB gzip.
- Web production build passed with Vite 6.4.3: 1704 modules transformed in 4.93 seconds.
- Main web entry: 317.04 kB, 100.83 kB gzip; CSS: 37.09 kB, 7.86 kB gzip. Route pages are lazy chunks.
- No source map, type, lint, formatting or build error remains.

## Documentation Conflicts

| Conflict | Chosen resolution | Reason |
| --- | --- | --- |
| `techspec.md` omitted `DRAFT`; PRD/app flow/database included it. | Implement `DRAFT` with controlled outgoing transitions. | PRD and app flow have higher priority. |
| App flow described an authorized duplicate-customer path; database/PRD required strict prevention unless an override was approved. | Enforce normalized phone uniqueness with no duplicate override. | No approved override policy exists; prevents accidental duplicates. |
| Plan grouped coupon/referral discounting while PRD specified coupon, referral, reward and manual discount order. | Use exact PRD order, then tax and rounding. | PRD controls business behaviour. |
| Tech spec left tax timing open. | Tax is after all discounts. | PRD gives the explicit order. |
| App flow made partial-payment invoice issuance configurable; invoice requirements require payment status in the invoice. | Permit invoice after completion at any payment status and snapshot that status. | Supports the documented partial-payment journey without changing an issued invoice. |
| Photo text allowed a policy override while the direct delivery request required mandatory live camera. | No gallery or camera bypass; only GPS has an audited Admin override. | The direct request is stricter. |
| Plan language could imply revenue from paid jobs; PRD/database use transactions. | Revenue is successful payments minus successful refunds. | Avoids recognizing unpaid job totals as revenue. |
| Referral documents differed on reward timing. | Reward becomes available only after the referred wash is completed and fully paid. | Satisfies the stricter PRD business rule and prevents premature rewards. |
| Database seed suggested a temporary initial password; the direct request forbids committed placeholder credentials. | One-time token-protected interactive bootstrap accepts an operator-chosen strong password. | No default/reusable credential is committed or logged. |

## Remaining Work and Risks

No approved product module is intentionally left as a mock or placeholder. The remaining items require external infrastructure or real hardware:

1. A Cloudflare account owner must provision production D1/R2/KV/Pages resources, supply real IDs/domains/secrets, configure Worker routes, keep R2 public access disabled, migrate, and deploy. No production deployment was authorized or performed.
2. Physical-device camera/GPS, Safari/iOS/iPadOS, Windows 10/11 and macOS validation must be completed and signed off. Automated browser/device emulation passed but is not equivalent to hardware.
3. A staging D1/R2 backup-restore rehearsal and production scheduled-trigger observation require provisioned Cloudflare resources.
4. Monitor the current development-only Cloudflare `sharp` advisory and upgrade the toolchain when a compatible release is available.
5. Standard `wa.me` opens a prefilled message and cannot attach a PDF automatically; the application correctly offers copy message, copy link and PDF download instead.

## Deployment Readiness

The source, schema, tests and dry-run bundles are ready for a controlled staging deployment. Production is **not yet launch-ready** until the account-owned bindings/secrets/routes are configured, the staging migration/restore/smoke tests pass, and physical-device verification is signed off. Follow `docs/deployment.md`, `docs/backup-restore.md`, and `docs/testing.md` in that order.
