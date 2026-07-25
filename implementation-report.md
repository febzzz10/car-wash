# WashPro Implementation Report

## Summary

WashPro was implemented from a documentation-only repository as a strict TypeScript monorepo. The application uses a React 19/Vite Cloudflare Pages frontend, a Hono Cloudflare Worker API, D1 for authoritative relational data, separate private R2 bindings for uploads and invoice PDFs, and KV only for short-lived camera challenges/cache state.

Completed modules include secure Admin/Staff authentication and permissions, Staff management, customer/vehicle histories, services and price history, the state-preserving live-camera/GPS New Wash wizard, status/timer workflows, server billing, coupons, referrals/rewards, partial payments/refunds, immutable PDF invoices/revisions/WhatsApp fallbacks, expenses/categories, dashboard/reports/exports, business settings, scheduled retention/reconciliation, protected private files, and append-only audit records.

Requirement-by-requirement evidence is in `requirements-traceability.md`. The initial empty-repository status and documentation decisions are in `docs/requirements-audit.md`.

The repository-connected Worker deployment runs from the root through `npm run deploy:api`, dispatches to `@washpro/api`, and targets the connected-build name `car-wash`. A tested predeploy gate prevents Wrangler from running while development variables or local D1/KV/R2 placeholders remain. A separate `remote-dev` environment now keeps Worker code local while using provisioned development-only Cloudflare D1, KV, and two private R2 resources; no Worker code was deployed and no production resource was created or changed. Read-only deployment queries confirmed that neither `car-wash` nor the former `washpro-api` name currently exists as a deployed Worker script in the authenticated account.

### Cloudflare remote-development integration

- Wrangler authentication and write permissions were verified for account `36c28c2516a8d4f17c0d010d6f12bf5f`.
- D1: `washpro-dev` (`f12e4f56-470a-488f-8e34-da502fe974d7`).
- KV: `washpro-cache-dev` (`72cd173f952343269324e671d68147e6`).
- Private R2: `washpro-uploads-dev` and `washpro-invoices-dev`.
- Local Worker name: top-level `car-wash`; named remote-development Worker name: `car-wash-remote-dev`.
- `DB`, `CACHE`, `UPLOADS`, and `INVOICES` are repeated under `env.remote-dev` with `remote: true`. The top-level configuration retains fully local simulated bindings.
- All nine D1 migrations were applied to the new database. A guarded data-only import migrated 58 local rows and excluded sessions, login attempts, password-reset tokens, idempotency records, and all KV data. Local/remote counts, content fingerprints, ID bounds, and foreign keys match. Both local and remote R2 buckets contained zero objects, so no object write or deletion was required.

### 2026-07-24 account migration result

The previously configured development IDs belonged to another Cloudflare account and were removed from active configuration. Wrangler 4.114.0 created all four resources in the confirmed account. No production resource or Worker deployment was created or modified.

The initial data-only execution reported `imported`. A later execution against the same backup reported `already-migrated`, proving the resume gate did not duplicate rows. Verification found zero count mismatches, zero content-fingerprint mismatches, zero ID-bound mismatches, zero foreign-key violations, zero R2 conflicts, and zero missing D1-to-R2 references. The private ignored evidence directory is `migration-backups/2026-07-24T18-37-17-462Z`; it contains the full state, SQL exports, R2 manifests, dry-run/execution/verification reports, and a non-sensitive phase log.

## Architecture Used

- `apps/web`: React 19, React Router, Vite, custom responsive design system and lazy page bundles.
- `apps/api`: Cloudflare Worker with Hono, prepared D1 statements, D1 batches, R2, KV, scheduled maintenance, `pdf-lib`.
- `packages/contracts`: shared Zod validation and enumerations.
- `packages/domain`: pure domain rules for billing, coupons, referrals, timers, GPS, payments, permissions, normalization and accounting.
- Vitest with Cloudflare Workers pool for unit/integration/security tests; Playwright for multi-browser responsive E2E.

## Files Changed

The latest Cloudflare account/data-migration pass modified `.gitignore`, `apps/api/scripts/validate-production-deploy.mjs`, `apps/api/wrangler.jsonc`, `docs/backup-restore.md`, `docs/deployment.md`, `docs/setup.md`, `docs/testing.md`, `implementation-report.md`, `package.json`, `requirements-traceability.md`, and `scripts/cloudflare-deployment.test.mjs`. It created `apps/api/scripts/r2-migration-bridge.mjs`, `docs/cloudflare-migration.md`, `scripts/cloudflare-migration.test.mjs`, `tools/cloudflare-migration/cli.mjs`, `tools/cloudflare-migration/lib.mjs`, and `tools/cloudflare-migration/r2-bridge-client.mjs`. No tracked file was removed. The R2 verification bridge runs only on localhost and is never deployed.

The starting repository contained only `plan.md`, `prd.md`, `appflow.md`, `techspec.md`, `database.md`, and `design.md`, with no Git metadata. Those six source documents were read completely and not modified. Every project file below was created. No project file was removed.

Generated/ignored local artifacts are not source files: `node_modules`, `apps/api/.dev.vars` (random local secrets), `.wrangler`, `migration-backups`, `apps/api/.tmp`, `apps/*/dist`, `output`, `playwright-report`, and `test-results`.

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
- `docs/cloudflare-migration.md`
- `scripts/setup-local-env.mjs`
- `scripts/generate-invoice-preview.ts`
- `scripts/cloudflare-deployment.test.mjs`
- `scripts/cloudflare-migration.test.mjs`
- `tools/cloudflare-migration/cli.mjs`
- `tools/cloudflare-migration/lib.mjs`
- `tools/cloudflare-migration/r2-bridge-client.mjs`
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
- `apps/api/scripts/validate-production-deploy.mjs`
- `apps/api/scripts/r2-migration-bridge.mjs`
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

The application schema adds 38 tables; remote SQLite metadata reports 40 tables including migration bookkeeping, 41 explicit indexes (including partial unique indexes), 3 views, and 29 integrity/immutability triggers. Primary/foreign/unique/check constraints, normalized search fields, optimistic `version` fields, snapshot columns, idempotency records, and immutable financial/history guards are included.

### Clean migration result

`wrangler 4.114.0` applied all nine migrations to remote development D1 `washpro-dev`; the final migration listing reports “No migrations to apply.” Remote verification reports migrations `0001_foundation.sql` through `0009_integrity_guards.sql`, 40 tables including migration bookkeeping, 41 indexes, 29 triggers, and 3 views.

The original `0009_integrity_guards.sql` used nested `SELECT CASE ... END` statements inside triggers. Local SQLite accepted them, but Cloudflare's remote D1 migration parser stopped at the nested `END` and returned `incomplete input`. The not-yet-applied migration was changed syntax-only to equivalent `SELECT RAISE(...) WHERE ...` trigger statements; trigger names, conditions, messages, and business behavior are preserved. A regression test forbids the incompatible trigger form, the migration test verifies the required trigger names, and the corrected migration applied remotely.

The same nine migrations also passed on an empty isolated local D1 persistence path. Every migration succeeded with zero failures, and the ordinary persisted local D1 reported “No migrations to apply.”

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
| Deployment contract | 1 Node test file passed, 5 tests passed, 0 failed. |
| Migration-tool contract, final dependency-free rerun | 1 Node test file passed, 16 tests passed, 0 failed. This includes local integrity/FK rejection, exact-fingerprint resumability, R2 create-only writes, metadata bridge behavior, account/environment gating and KV exclusions. |
| Automated application baseline total | 26 files passed, 65 tests passed, 0 failed before this migration-tool pass. |
| Playwright | 16 passed, 4 intentionally skipped duplicate media runs, 0 failed, 44.9 seconds. |
| Clean D1 migration | 9/9 migrations passed from empty local state; 9/9 applied to `washpro-dev`; both report no pending migrations. |
| Development data migration | 58/58 selected D1 rows matched by count, content fingerprint and ID bounds; 0 foreign-key violations; resumable rerun reported `already-migrated`. |
| R2/KV migration | 0 local and remote upload objects, 0 local and remote invoice objects, 0 KV keys copied, 0 conflicts, 0 missing D1-to-R2 references. |
| Live API connectivity | Remote-development Hono health `200`; anonymous session `401`; no Worker deployment. |
| Clean dependency install baseline | Earlier `npm ci`: 312 packages added, 317 audited, 0 vulnerabilities. The final post-migration rerun was blocked by sandbox `EPERM` on the user npm cache and the host approval quota; that failed attempt removed ignored `node_modules`, so dependencies must be restored before another full local gate. |
| Final dependency-free Cloudflare contract rerun | `npm run test:deployment`: 5/5 passed; `npm run test:migration`: 16/16 passed; combined 21 passed, 0 failed. |
| Final full repository gate | Attempted and blocked by missing dependencies: sandbox `EPERM` denied the user npm cache, the host approval quota blocked the required unrestricted `npm ci` retry, and only workspace links remain under `node_modules`. Exact missing commands were `prettier`, `eslint`, `tsc`, `vitest`, and `wrangler`. Formatting, lint, typecheck, Vitest, Playwright and builds therefore retain the earlier passing baseline above, not a new final-tree result. |
| Production dependency audit | 0 vulnerabilities across production dependencies. |
| Full dependency audit | 0 vulnerabilities after a non-forced in-range Cloudflare toolchain update. |

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
- The new R2 buckets were created with Cloudflare's private default and no public access was enabled. The explicit post-creation `r2.dev`/custom-domain query was blocked by the host approval quota and remains a Dashboard verification item.
- Append-only payments, refunds, timer events, reward ledger and audits; issued invoice/update/delete database guards.
- Idempotency keys and unique constraints for duplicate job/payment/invoice/reward/expense requests.
- CSP, HSTS, anti-framing, no-sniff, referrer and scoped camera/geolocation Permissions Policy headers.
- No plain passwords, raw session tokens, UPI PINs or full card data in production storage or logs.

The initial full audit found four high-severity entries for one transitive `sharp <0.35.0` advisory through `@cloudflare/vitest-pool-workers@0.18.7`, `wrangler@4.113.0`, and `miniflare@4.20260721.0`. A non-forced `npm audit fix` updated the compatible development toolchain to Vitest pool 0.18.8, Wrangler 4.114.0, Miniflare 4.20260722.0, and `sharp` 0.35.2. The final full audit and `npm audit --omit=dev` both report zero vulnerabilities; all tests and builds passed again after the lockfile update.

## Build

- Worker dry run passed with Wrangler 4.114.0: 1745.75 KiB upload, 368.75 KiB gzip.
- Remote-development Worker dry run passed with the same bundle size and listed only `washpro-dev`, `washpro-cache-dev`, `washpro-uploads-dev`, and `washpro-invoices-dev` for the four bindings.
- Web production build passed with Vite 6.4.3: 1704 modules transformed in 5.03 seconds.
- Main web entry: 317.04 kB, 100.83 kB gzip; CSS: 37.09 kB, 7.86 kB gzip. Route pages are lazy chunks.
- The application build and remote-development dry run passed before the final dependency-cleanup attempt. Restore `node_modules` and rerun the full local gate before commit/deployment; the final rerun could not execute after the sandbox-blocked `npm ci` removed dependencies.

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
| The integration request forbids rewriting migrations, but existing `0009_integrity_guards.sql` was rejected by remote D1 before any later corrective migration could run. | Preserve every trigger name, condition, error, and behavior while replacing only unsupported nested `SELECT CASE ... END` trigger syntax with D1-compatible `SELECT RAISE(...) WHERE ...` syntax. | `0009` had not applied remotely; leaving it untouched makes clean remote migration impossible, and a new `0010` cannot be reached. The exception is regression-tested and disclosed rather than silently ignored. |

## Remaining Work and Risks

No approved product module is intentionally left as a mock or placeholder. The remaining items require external infrastructure or real hardware:

1. A Cloudflare account owner must still provision production D1/R2/KV/Pages resources, supply real IDs/domains/secrets, configure Worker routes, keep R2 public access disabled, migrate, and deploy. Only isolated development resources were provisioned; no production deployment was authorized or performed.
2. Physical-device camera/GPS, Safari/iOS/iPadOS, Windows 10/11 and macOS validation must be completed and signed off. Automated browser/device emulation passed but is not equivalent to hardware.
3. A staging D1/R2 backup-restore rehearsal and production scheduled-trigger observation require provisioned Cloudflare resources.
4. Standard `wa.me` opens a prefilled message and cannot attach a PDF automatically; the application correctly offers copy message, copy link and PDF download instead.
5. Restore ignored dependencies with `npm ci` outside the restricted host sandbox, then rerun formatting, lint, typecheck, all tests, E2E and both builds. Also confirm the two new R2 buckets have no `r2.dev` URL or custom domain and inspect Cloudflare Workers Builds for a stale `CLOUDFLARE_ACCOUNT_ID`.

## Deployment Readiness

The source, schema, migration evidence and remote-development bindings are ready for controlled development use. The current checkout is not ready to commit or deploy until ignored dependencies are restored and the full local gate is rerun. Production is **not yet launch-ready**: the top-level configuration deliberately retains `APP_ENV=development`, a localhost origin, and local D1/KV/R2 placeholders, so the production predeploy guard remains effective. The four required secret names are declared, but `car-wash-remote-dev` was not deployed and therefore has no remote secret values; production resources, secrets, routes and domains are also not configured. Production provisioning, a staging restore rehearsal, the new-bucket public-domain check, and physical-device verification remain. Follow `docs/deployment.md`, `docs/backup-restore.md`, and `docs/testing.md` in that order.
