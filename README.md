# WashPro

WashPro is a mobile-first car-wash operations application for Administrators and Staff. It covers customer and vehicle records, live-camera and GPS-verified wash intake, server-persisted timers, promotions, payments and refunds, immutable invoices, expenses, reports, business settings, and append-only auditing.

## Architecture

- `apps/web`: React 19 and Vite single-page application for Cloudflare Pages
- `apps/api`: Hono Cloudflare Worker using D1, two private R2 buckets, and KV for non-authoritative cache/temporary state
- `packages/contracts`: shared strict Zod request contracts and enums
- `packages/domain`: framework-independent billing, promotion, timer, permission, normalization, location, payment, and reporting rules
- `apps/api/migrations`: nine ordered D1 migrations
- `e2e`: Playwright browser and responsive-flow tests

Financial and operational records are authoritative in D1. Customer photos, receipts, logos, and invoice PDFs are private R2 objects; D1 stores only metadata and object keys. KV is never used as the source of truth.

## Quick start

Use Node.js 22 or newer.

```powershell
npm install
npm run setup:local
npm run migrate:local
```

Run `npm run dev:api` and `npm run dev` in separate terminals, then bootstrap the first Administrator using the procedure in [docs/setup.md](docs/setup.md).

## Quality commands

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The connected Cloudflare Worker deploy command is `npm run deploy:api` from the repository root. It targets `car-wash` and runs a production-binding preflight before Wrangler. See the deployment guide before enabling a production build.

## Operations and evidence

- [Local setup and environment](docs/setup.md)
- [Testing](docs/testing.md)
- [Cloudflare deployment](docs/deployment.md)
- [Backup and restore](docs/backup-restore.md)
- [Requirement traceability](requirements-traceability.md)
- [Implementation report](implementation-report.md)
