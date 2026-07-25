# Testing

## Automated suites

Run from the repository root:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:migration
npm test
npm run test:e2e
npm run build
```

The unit suite covers normalization, billing order/caps/tax/rounding, coupon and referral eligibility, GPS distance, timer calculations and transitions, payment status, profit, permissions, shared contracts, navigation, persisted wizard state, and regional formatting.

Worker integration tests run against an isolated Miniflare D1/R2/KV environment and apply the same nine migration files used in deployment. They cover bootstrap, authentication and expiry, disabled Staff, role bypass, customer/vehicle conflicts, histories, services/promotions, job creation, GPS/photo metadata, timer transitions, coupon reservations, referral reward finalization, partial/full payments, idempotency, refunds, immutable invoices and token expiry, private-file access, expenses/reports, audit redaction, SQL-injection-shaped input, and organization/branch isolation.

Playwright exercises login and responsive navigation on Chromium desktop, Pixel 7 emulation, Galaxy Tab emulation, Firefox desktop, and iPhone 15 WebKit emulation. The full New Wash camera/GPS retry workflow runs once in Chromium; the other projects intentionally skip that duplicate media test while still running their shared flows.

## Cloudflare remote-development verification

Validate configuration without deploying:

```powershell
npm run build:remote-dev --workspace=@washpro/api
npm run cloudflare:provision:verify
npm run cloudflare:migration:verify
npx wrangler deploy --dry-run --env remote-dev --outdir dist --cwd apps/api
npx wrangler d1 migrations list DB --remote --env remote-dev --cwd apps/api
```

The 2026-07-24 migration verification compared local and remote row counts, per-table SHA-256 content fingerprints, minimum/maximum IDs, and foreign-key integrity. All matched. The local state had zero file assets and zero objects in either R2 bucket, so remote binding inventory verified both destination buckets at zero objects without adding or deleting test objects. Local and remote KV each had zero active keys; no session, CSRF, rate-limit, capture, cache, or expiring-link data was migrated.

The same live run started the real Hono application with `npm run dev:api:remote`: `/health` returned `200` with `washpro-api` status `ok`, and an anonymous session request returned `401`. Authenticated browser verification still requires an operator-known password; no password was requested, recovered, logged, or replaced during migration.

## Manual launch checklist

Automated emulation does not replace real hardware validation. Before production launch, record evidence for:

1. Current Android phone in Chrome: camera capture/retake, geolocation denied/retry/outside-radius, offline recovery, touch navigation.
2. Current iPhone in Safari: camera lifecycle, page return, geolocation accuracy, invoice print/share fallbacks.
3. Android tablet and iPad: wizard, data tables, dialogs, rotation, keyboard where available.
4. Windows 10 and 11 in current Chrome/Edge/Firefox: Admin workflows, PDF view/download/print, CSV export.
5. macOS in current Safari/Chrome/Firefox: Staff and Admin navigation and protected invoice links.
6. Keyboard-only pass: visible focus, skip link, dialog focus trap/return, form errors, Escape close.
7. Screen-reader smoke pass: headings, labels, status announcements, dialog names, busy states.
8. Contrast and zoom: WCAG-oriented AA contrast, 200% zoom, 320 CSS-pixel layout, reduced motion.

## Production smoke test

Use a dedicated staging organization and non-production customer data. Verify Admin and Staff login, account disable/session revocation, a complete live-camera and GPS wash, timer refresh persistence, coupon/referral/reward rules, partial/full payment, refund, invoice revision and protected link expiry, WhatsApp/copy/download fallbacks, expense cancellation, dashboard/report reconciliation, audit entries, and scheduled retention/reconciliation. Never use fabricated successful payment or refund records in production.
