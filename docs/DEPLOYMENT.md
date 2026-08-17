# WashPro Deployment Procedure

## Prerequisites

- Node.js ≥ 22
- pnpm 10.11.1
- Wrangler 4.114.0 (installed via monorepo devDependencies)
- Cloudflare account with access to `xpersscarwash@gmail.com` resources
- All secrets set on `car-wash` Worker via `wrangler secret put`

## Local verification (required before every deployment)

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r test
pnpm run build:web
pnpm --filter @washpro/api exec wrangler deploy --dry-run
```

All must pass with zero errors before deploying.

## Deploy API Worker (`car-wash`)

```bash
pnpm run deploy:api
```

This runs:
1. `apps/api/scripts/validate-production-deploy.mjs` (predeploy)
2. `wrangler deploy --env=""` from `apps/api/`

Record the version ID from the deploy output.

## Deploy Web Worker (`washpro-web`)

```bash
pnpm run deploy:web
```

This runs:
1. `wrangler deploy --config dist/washpro_web/wrangler.json` from `apps/web/`

The generated config is produced by Vite + `@cloudflare/vite-plugin` during the build step.

Record the version ID from the deploy output.

## Post-deployment verification

### Endpoint checks (curl)

```bash
# SPA loads
curl -sS -o /dev/null -w "%{http_code}" https://washpro-web.xpersscarwash.workers.dev/login
# → 200

# API proxy works
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data-binary @login-body.json \
  https://washpro-web.xpersscarwash.workers.dev/api/v1/auth/login
# → 401 application/json AUTH_INVALID_CREDENTIALS

# Invoice route reaches API
curl -sS https://washpro-web.xpersscarwash.workers.dev/invoice/test
# → 404 application/json (generic API not-found; the public invoice-token route no longer exists)

# No 1101 anywhere
```

### Browser smoke test

1. Open `https://washpro-web.xpersscarwash.workers.dev/login`
2. Log in as administrator
3. Verify dashboard loads
4. Navigate to Staff, Customers, Wash Jobs
5. Test one non-destructive staff action (view activity)
6. Log out

**Never test destructive actions on the only owner/admin account.**

## Bindings reference

### washpro-web
```jsonc
{
  "assets": { "directory": "dist", "binding": "ASSETS", "not_found_handling": "single-page-application" },
  "services": [{ "binding": "API", "service": "car-wash" }]
}
```

### car-wash
```jsonc
{
  "workers_dev": false,
  "d1_databases": [{ "binding": "DB", "database_name": "washpro-dev" }],
  "kv_namespaces": [{ "binding": "CACHE", "id": "72cd173f..." }],
  "r2_buckets": [
    { "binding": "UPLOADS", "bucket_name": "washpro-uploads-dev" },
    { "binding": "INVOICES", "bucket_name": "washpro-invoices-dev" }
  ],
  "vars": {
    "ADMIN_LOGIN_EMAIL": "xpersscarwash@gmail.com",
    "ALLOWED_ORIGINS": "https://bab9bd69.washpro-web.pages.dev,https://washpro-web.xpersscarwash.workers.dev",
    "APP_ENV": "production",
    "AUTH_MODE": "hybrid_admin_staff"
  }
}
```

`AUTH_MODE` accepts `hybrid_admin_staff` (default, static admin + DB staff login) or `static_admin` (admin-only). The production deploy preflight validates the value.

### Required secrets on car-wash
- `ADMIN_LOGIN_PASSWORD`
- `BOOTSTRAP_TOKEN`
- `CSRF_SECRET`
- `GEOCODE_CACHE_PEPPER`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `LOCATIONIQ_API_KEY`
- `SESSION_PEPPER`

Required vars (set in `wrangler.jsonc`): `ADMIN_LOGIN_EMAIL`, `ALLOWED_ORIGINS`, `APP_ENV`, `AUTH_MODE`, `GEOCODE_CACHE_TTL_SECONDS`, `GEOCODE_USER_AGENT`, `GMAIL_SENDER_EMAIL`, `INVOICE_EMAIL_IDEMPOTENCY_TTL_SECONDS`, `INVOICE_EMAIL_RATE_LIMIT`, `INVOICE_LINK_TTL_SECONDS`, `LOCATIONIQ_BASE_URL`, `SESSION_TTL_SECONDS`.

Set via:
```bash
pnpm --dir apps/api exec wrangler secret put <NAME>
```

## Rollback

```bash
pnpm --dir apps/api exec wrangler rollback    # API rollback
pnpm --dir apps/web exec wrangler rollback --config dist/washpro_web/wrangler.json  # Web rollback
```

Or deploy a known-good commit.

## Important constraints

- Never expose `car-wash.xpersscarwash.workers.dev` publicly
- Never change `workers_dev: false` on car-wash
- Never change resource IDs in wrangler.jsonc
- Never commit secrets or `.dev.vars`
- Never use the Cloudflare dashboard to manually edit bindings without updating the repo config
