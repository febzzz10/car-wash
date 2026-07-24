# Cloudflare deployment

## Deployment model

- React production assets deploy to Cloudflare Pages.
- The Hono API deploys as a Cloudflare Worker on same-site `/api/*` and protected `/invoice/*` routes.
- D1 holds authoritative relational data.
- `UPLOADS` and `INVOICES` are separate private R2 buckets.
- KV is limited to temporary/cache use.
- The Worker scheduled trigger runs retention and reconciliation at `17 2 * * *` UTC.

Production resource identifiers and domains are account-owned values and are intentionally not committed. Deployment is blocked until a Cloudflare account owner provisions them and replaces the local placeholders in `apps/api/wrangler.jsonc` with the real production bindings. The top-level Wrangler configuration targets the existing `car-wash` Worker; do not add `--env production`, because a named Wrangler environment would target a separate `car-wash-production` Worker.

## Cloudflare Workers Builds settings

Configure the connected repository from the repository root with these exact values:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:api` |
| Worker name | `car-wash` |

`npm run deploy:api` dispatches to the existing `@washpro/api` workspace, where Wrangler automatically discovers `apps/api/wrangler.jsonc` and `src/index.ts`. Do not use a root-level `npx wrangler deploy`; there is intentionally no root Wrangler configuration.

## Provision production resources

Authenticate Wrangler to the intended Cloudflare account, then create uniquely named production resources:

```powershell
npx wrangler d1 create washpro-production
npx wrangler r2 bucket create washpro-uploads-production
npx wrangler r2 bucket create washpro-invoices-production
npx wrangler kv namespace create CACHE
```

Copy the returned D1 database ID and KV namespace ID into the top-level bindings in `apps/api/wrangler.jsonc`. Bind the two exact R2 bucket names. Do not reuse `local`, `local-cache`, or any `*-local` resource name.

Keep both R2 buckets private: do not enable an `r2.dev` URL and do not attach a public custom domain. All file reads must continue through the authenticated API or a validated expiring invoice token.

## Configure production variables and secrets

Set `APP_ENV` to `production`, add the exact HTTPS web origin or origins in `ALLOWED_ORIGINS`, and verify the session/invoice TTLs in `apps/api/wrangler.jsonc`. Store each sensitive value through Wrangler or the Cloudflare dashboard for the `car-wash` Worker:

```powershell
npm exec --workspace=@washpro/api -- wrangler secret put BOOTSTRAP_TOKEN
npm exec --workspace=@washpro/api -- wrangler secret put SESSION_PEPPER
npm exec --workspace=@washpro/api -- wrangler secret put CSRF_SECRET
npm exec --workspace=@washpro/api -- wrangler secret put INVOICE_TOKEN_PEPPER
```

Generate independent high-entropy values; do not copy `.dev.vars`. After the one-time bootstrap, retain the bootstrap secret in a controlled secret manager or rotate it. The endpoint also refuses bootstrap once a user exists.

## Migrate, deploy, and route

First validate on staging. Back up production before every schema deployment, then:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run migrate:remote --workspace @washpro/api
npm run deploy:api
npx wrangler pages deploy apps/web/dist --project-name washpro-web
```

The API workspace runs `scripts/validate-production-deploy.mjs` before every deployment. It prevents Wrangler from running until the Worker name, entry point, production origins, D1/KV/R2 bindings, TTLs, and required secret declarations are production-safe. Secret declarations do not create secret values; confirm all four values exist in Cloudflare before deploying.

Configure the Worker routes for the chosen same-site hostname before the Pages fallback. `apps/web/public/_headers` supplies CSP, HSTS, anti-framing, MIME-sniffing, referrer, and camera/geolocation permissions policy; `_redirects` provides SPA fallback. TLS must remain enforced by Cloudflare.

## Release verification

1. Confirm all nine D1 migrations are applied remotely.
2. Confirm both R2 buckets report no public development URL or public custom domain.
3. Confirm secrets are present but not readable in configuration output.
4. Confirm Pages and Worker use the intended production account, branch, hostname, and bindings.
5. Run the production smoke checklist in `docs/testing.md` against staging, then a minimal controlled production smoke test.
6. Verify the scheduled maintenance trigger, audit log, protected invoice links, and dashboard/report reconciliation.
7. Retain the D1 Time Travel bookmark and release artifact identifiers for rollback.

## Rollback

Code rollback uses the prior Worker/Pages deployment. Database rollback is separate and potentially destructive; follow `docs/backup-restore.md`, preserve the pre-restore bookmark, and obtain explicit operational approval before restoring D1.
