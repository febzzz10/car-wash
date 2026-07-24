# WashPro Complete Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the complete WashPro car wash management application from the six approved specification documents.

**Architecture:** Use an npm TypeScript monorepo with a React/Vite frontend, a Hono Cloudflare Worker API, shared Zod contracts, pure domain modules, Cloudflare D1 repositories, and private R2 file adapters. Domain and accounting rules remain independent of Worker and React code; route handlers authorize, validate, and call focused application modules.

**Tech Stack:** TypeScript strict mode, React, Vite, React Router, TanStack Query, React Hook Form, Zod, Hono, Cloudflare Workers, D1, R2, KV, Vitest, Testing Library, Playwright, PDFKit-compatible Worker PDF generation, ESLint, and Prettier.

## Global Constraints

- `prd.md` controls product and business behaviour; conflict priority then follows `appflow.md`, `database.md`, `techspec.md`, `design.md`, and `plan.md`.
- Money is integer minor currency units and percentages are integer basis points.
- UTC server timestamps are authoritative; `Asia/Kolkata` is the default display and reporting timezone.
- D1 is authoritative for all operational and financial state. R2 stores private binary objects. KV stores only cache, temporary, or rate-limit state.
- Every query is organization and branch scoped where applicable.
- Mutating routes require authentication, backend permission checks, validation, CSRF/origin protection, and idempotency where specified.
- Completed jobs, financial transactions, timer events, issued invoices, and audit logs are append-only or revision-based.
- Mandatory wash photos come from a live `getUserMedia` stream; a gallery upload cannot satisfy that requirement.
- The application is online-first and may preserve only safe draft input locally.
- The documented deep navy and water-blue token system, responsive shells, WCAG 2.1 AA-oriented interaction, and 44px minimum touch targets apply throughout.

---

### Task 1: Monorepo Foundation and Shared Contracts

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.env.example`
- Create: `packages/contracts/src/index.ts`, `packages/contracts/src/enums.ts`, `packages/contracts/src/schemas.ts`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`
- Test: `packages/contracts/src/schemas.test.ts`

**Interfaces:**
- Produces: shared `UserRole`, `Permission`, `WashJobStatus`, `PaymentStatus`, request schemas, `ApiSuccess<T>`, and `ApiFailure` types.

- [ ] Write schema tests that reject invalid statuses, floating money, unnormalized empty identifiers, invalid pagination, and unsafe file metadata.
- [ ] Run `npm test -- packages/contracts/src/schemas.test.ts` and confirm failures because contracts do not exist.
- [ ] Add strict workspace configuration and shared schemas with no `any` types.
- [ ] Re-run the contract test and `npm run typecheck`.

### Task 2: Pure Domain Modules

**Files:**
- Create: `packages/domain/src/normalization.ts`, `billing.ts`, `coupons.ts`, `referrals.ts`, `timers.ts`, `payments.ts`, `reports.ts`, `location.ts`, `permissions.ts`, `ids.ts`, `index.ts`
- Test: matching `*.test.ts` files in `packages/domain/src/`

**Interfaces:**
- Produces: `normalizePhone`, `normalizeRegistration`, `normalizeCode`, `calculateBill`, `validateCoupon`, `validateReferral`, `calculateTimer`, `transitionTimer`, `derivePaymentStatus`, `calculateFinancialSummary`, `distanceMeters`, `verifyLocation`, and `hasPermission`.
- Domain functions accept immutable values and return typed results without database or network access.

- [ ] Add focused failing tests for normalization, billing order, discount caps, tax, rounding, coupons, referrals, timer transitions and durations, payment status, profit, GPS distance, and permission checks.
- [ ] Run each test file and confirm the expected missing-function failure.
- [ ] Implement the smallest pure functions that satisfy each invariant.
- [ ] Re-run the domain suite after every module and refactor only while green.

### Task 3: D1 Schema, Seed, and Reconciliation

**Files:**
- Create: `apps/api/migrations/0001_foundation.sql` through `0008_reporting.sql`
- Create: `apps/api/src/db/seed.ts`, `apps/api/src/db/reconcile.ts`, `apps/api/src/db/types.ts`
- Create: `scripts/create-admin.ts`, `scripts/verify-migrations.ts`
- Test: `apps/api/test/migrations.test.ts`, `reconciliation.test.ts`

**Interfaces:**
- Produces all 38 documented core tables, indexes, constraints, reporting views, version columns, immutable triggers, and non-placeholder seed records.
- `create-admin.ts` requires `WASHPRO_ADMIN_*` environment values and never writes a plain password.

- [ ] Write failing migration tests for clean apply, duplicate phone/registration, invalid foreign keys, invalid money, immutable audit/timer/invoice rows, required indexes, and reporting views.
- [ ] Run the migration tests against an empty local D1 database and record the failures.
- [ ] Add eight dependency-ordered migrations and typed seed/reconciliation utilities.
- [ ] Apply migrations to a new local D1 database and run `PRAGMA foreign_key_check` and reconciliation tests.

### Task 4: API Foundation, Security, and Authentication

**Files:**
- Create: `apps/api/src/index.ts`, `app.ts`, `env.ts`, `errors.ts`
- Create: `apps/api/src/middleware/auth.ts`, `authorization.ts`, `csrf.ts`, `request-id.ts`, `rate-limit.ts`, `security-headers.ts`
- Create: `apps/api/src/modules/auth/*`, `users/*`, `audit/*`
- Create: `apps/api/wrangler.jsonc`, `apps/api/package.json`, `apps/api/tsconfig.json`
- Test: `apps/api/test/auth.integration.test.ts`, `authorization.security.test.ts`, `audit.integration.test.ts`

**Interfaces:**
- Produces `createApp(env)` and authenticated `RequestContext` carrying organization, branch, user, permissions, request ID, and client metadata.
- Sessions use a random opaque cookie token and store only SHA-256 token hashes. Passwords use PBKDF2-SHA-256 with per-user random salts and versioned work factors.

- [ ] Write failing login, disabled/locked account, expiry, logout, reset, password-change, session-revocation, rate-limit, CSRF, redaction, and permission-bypass tests.
- [ ] Run the tests and confirm authentication routes are absent.
- [ ] Implement secure cookie sessions, login-attempt records, adaptive password verification, rate limiting, backend permissions, safe errors, headers, and audit events.
- [ ] Re-run authentication and security tests, then API type checking.

### Task 5: Staff, Customers, Vehicles, Services, and Settings

**Files:**
- Create focused modules under `apps/api/src/modules/users`, `customers`, `vehicles`, `services`, `settings`
- Test matching integration tests under `apps/api/test/`

**Interfaces:**
- Produces paginated CRUD/search/history routes with organization scoping, optimistic versions, strict duplicate handling, soft deactivation, historical price rows, and audited settings updates.

- [ ] Write failing tests for normalized search, duplicates, deactivation, ownership snapshots, service price versioning, disabled services, Staff activity, and sensitive settings permissions.
- [ ] Run tests and confirm expected route or behaviour failures.
- [ ] Implement repositories with bound SQL parameters and application modules with centralized permission checks.
- [ ] Re-run focused and cross-organization security tests.

### Task 6: Private Files, Camera/GPS Metadata, Jobs, and Timers

**Files:**
- Create: `apps/api/src/storage/r2-storage.ts`, `apps/api/src/modules/files/*`, `locations/*`, `wash-jobs/*`, `timers/*`
- Test: upload, GPS, job, timer, idempotency, and private-file integration/security tests

**Interfaces:**
- Produces private upload/fetch interfaces, server-side image signature/size validation, GPS snapshot verification, transactional job creation, versioned timer commands, and audited Admin adjustments.

- [ ] Write failing tests for invalid file type/signature/size, unauthorized file access, missing camera capture, GPS failure/override, ownership mismatch, duplicate job request, all status transitions, timer conflict, pause exclusion, cancellation release, and completed-job locking.
- [ ] Run tests and confirm failures at the intended seam.
- [ ] Implement R2 metadata adapters, location verification, transactional job creation, timer events, optimistic locking, cancellation, and correction records.
- [ ] Re-run focused integration and security tests.

### Task 7: Coupons, Referrals, Payments, Refunds, and Invoices

**Files:**
- Create modules under `apps/api/src/modules/coupons`, `referrals`, `payments`, `invoices`
- Create: `apps/api/src/modules/invoices/pdf.ts`, `share-message.ts`
- Test: focused integration and retry/concurrency tests

**Interfaces:**
- Produces transaction-safe reservation/release/finalization, reward ledger operations, idempotent partial payments and refunds, immutable invoice snapshots/revisions, private PDF objects, expiring token links, and honest WhatsApp fallback content.

- [ ] Write failing tests for every coupon rejection, self/duplicate referral, reward timing and balance, stacking, partial/full/refunded statuses, duplicate payment/refund, invoice retry/revision/token expiry, PDF content, and share message.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement domain-backed application modules and D1 batch operations with unique constraints and idempotency records.
- [ ] Re-run focused suites plus revenue/referral regression tests.

### Task 8: Expenses, Dashboard, Reports, Exports, and Governance

**Files:**
- Create modules under `apps/api/src/modules/expenses`, `reports`, `exports`, `audit`
- Create: `apps/api/src/modules/reports/csv.ts`, `pdf.ts`
- Test: expense/report/export/reconciliation/audit integration tests

**Interfaces:**
- Produces filtered expenses with receipt metadata and cancellation, a shared accounting query layer for dashboard and reports, CSV/PDF exports, append-only audit retrieval, and reconciliation results.

- [ ] Write failing tests for expense filters/cancellation, net revenue, active expenses, net profit, all documented report dimensions, timezone boundaries, export filters, Staff report denial, and audit immutability/redaction.
- [ ] Run tests and confirm failures.
- [ ] Implement shared accounting queries and export renderers without browser-local financial calculations.
- [ ] Re-run report consistency and cross-role tests.

### Task 9: React Application Shell and Authentication UI

**Files:**
- Create: `apps/web/*` Vite configuration and `src/app`, `routes`, `layouts`, `components`, `styles`, `features/auth`
- Test: shell, route guard, login, offline banner, session expiry, and navigation component tests

**Interfaces:**
- Produces responsive Admin/Staff route shells, query client, authenticated session context, accessible primitives, notifications, dialogs, error boundary, and network state.

- [ ] Write failing tests for role redirects, hidden and blocked Admin navigation, keyboard focus, disabled/loading/error states, and mobile/desktop navigation.
- [ ] Run component tests and confirm missing UI failures.
- [ ] Implement centralized tokens, self-hosted Inter, Phosphor icons, accessible shells, login, session expiry, offline banner, skeletons, and toasts.
- [ ] Re-run component tests and accessibility assertions.

### Task 10: Operational UI and New Wash Workflow

**Files:**
- Create frontend features for customers, vehicles, capture, services, wash jobs, timers, payments, invoices, and sharing
- Test focused component tests and Playwright operational journeys

**Interfaces:**
- Produces a persistent seven-stage wizard whose third stage combines camera and GPS, camera-only mandatory capture, compressed preview/upload, pricing review, job creation, active timer, payment, invoice, and fallback sharing.

- [ ] Write failing tests for wizard state retention, duplicate warnings, camera/GPS denial and retry, gallery exclusion, pricing display, server error step routing, timer refresh, partial payment, invoice actions, and share fallback.
- [ ] Run component and browser tests and confirm failures.
- [ ] Implement the workflow using React Hook Form, shared schemas, query mutations, and safe session draft state.
- [ ] Re-run operational UI tests at mobile, tablet, and desktop viewports.

### Task 11: Admin and History UI

**Files:**
- Create frontend features for dashboard, Staff, services/prices, coupons, referrals, expenses, reports, settings, audit, customer history, vehicle history, and job history
- Test focused component and Playwright Admin journeys

**Interfaces:**
- Produces every documented Admin page, responsive table/card pairs, filters, exports, settings sections, read-only audit diffs, and linked histories.

- [ ] Write failing tests for role visibility, financial cards, shared filters, management forms, confirmations/reasons, history linking, responsive tables/cards, and empty/loading/error states.
- [ ] Run tests and confirm failures.
- [ ] Implement pages and reusable feature modules with the documented navigation and copy.
- [ ] Re-run Admin journeys and accessibility checks.

### Task 12: Operations, Documentation, and Release Verification

**Files:**
- Create: `README.md`, `docs/setup.md`, `docs/testing.md`, `docs/deployment.md`, `docs/backup-restore.md`, `docs/security.md`, `docs/user-guide-admin.md`, `docs/user-guide-staff.md`
- Create/update: `requirements-traceability.md`, `implementation-report.md`, CI configuration, Playwright configuration

**Interfaces:**
- Produces exact environment/binding documentation, staging/production deployment steps, migration/backup/restore procedures, training guides, known limitations, and evidence-based reports.

- [ ] Run formatting, linting, type checking, unit tests, integration tests, security tests, E2E tests, clean D1 migration/seed verification, production builds, and deployment dry-run.
- [ ] Inspect responsive screenshots, keyboard flow, focus, contrast, camera/GPS recovery, full wash flow, financial reconciliation, audit entries, and secret/placeholders scan.
- [ ] Update traceability row by row using only fresh verification evidence and list every changed file in the implementation report.
- [ ] Record exact pass/fail counts, unverified physical device/browser items, deployment blockers, remaining risks, and the recommended next action.

