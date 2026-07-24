# Cloudflare deployment

## Deployment model

- React production assets deploy to Cloudflare Pages.
- The Hono API deploys as a Cloudflare Worker on same-site `/api/*` and protected `/invoice/*` routes.
- D1 holds authoritative relational data.
- `UPLOADS` and `INVOICES` are separate private R2 buckets.
- KV is limited to temporary/cache use.
- The Worker scheduled trigger runs retention and reconciliation at `17 2 * * *` UTC.

Production resource identifiers and domains are account-owned values and are intentionally not committed. Deployment is blocked until a Cloudflare account owner provisions them and replaces the local placeholders in `apps/api/wrangler.jsonc` with the real production bindings. The top-level Wrangler configuration targets the connected-build name `car-wash`; do not add `--env production`, because a named Wrangler environment would target a separate `car-wash-production` Worker. A read-only 2026-07-24 inventory found no deployed script named `car-wash` or `washpro-api` in the authenticated account, so the first authorized production deployment must be coordinated with the Cloudflare Builds project and will create `car-wash` rather than update an existing script.

## Remote development environment

`apps/api/wrangler.jsonc` is the single Wrangler configuration. Its top-level bindings remain fully local, while `env.remote-dev` runs local Worker code against these separate Cloudflare development resources:

| Service | Resource | Binding behavior |
| --- | --- | --- |
| D1 | `washpro-dev` (`4d0c969f-b8f1-4cc8-b15a-3d38687a1cc2`) | `DB`, `remote: true` |
| KV | `washpro-cache-dev` (`b2625dab32d14d1cb2c46a7cd35a97ca`) | `CACHE`, `remote: true` |
| R2 | `washpro-uploads-dev` | `UPLOADS`, `remote: true` |
| R2 | `washpro-invoices-dev` | `INVOICES`, `remote: true` |

Use these commands from the repository root:

```powershell
npm run dev:api:local
npm run dev:api:remote
npm run db:migrate:remote-dev
npm run build --workspace=@washpro/api
npm run build:remote-dev --workspace=@washpro/api
```

The remote-development variables are `APP_ENV=development`, `ALLOWED_ORIGINS=http://localhost:5173`, `SESSION_TTL_SECONDS=28800`, and `INVOICE_LINK_TTL_SECONDS=604800`. Bindings and variables are repeated in the named environment because Wrangler environments do not inherit them. Local secrets remain in ignored `.dev.vars`; before any optional `npm run deploy:remote-dev --workspace=@washpro/api`, configure the four declared secret values specifically for `--env remote-dev`.

The setup follows Cloudflare's current [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [environments](https://developers.cloudflare.com/workers/wrangler/environments/), [local-development remote bindings](https://developers.cloudflare.com/workers/local-development/), [D1 migration](https://developers.cloudflare.com/d1/reference/migrations/), [KV](https://developers.cloudflare.com/kv/get-started/), [R2](https://developers.cloudflare.com/r2/get-started/cli/), and [Workers Builds monorepo](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) documentation. `remote: true` is binding-specific and keeps Worker code local; the legacy mode that runs Worker code remotely is not used.

## Cloudflare Workers Builds settings

Configure the connected repository from the repository root with these exact values:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:api` |
| Worker name | `car-wash` |

`npm run deploy:api` dispatches to the existing `@washpro/api` workspace, where Wrangler automatically discovers `apps/api/wrangler.jsonc` and `src/index.ts`. Do not use a root-level `npx wrangler deploy`; there is intentionally no root Wrangler configuration.

The production Worker name remains `car-wash`. The named development environment uses `car-wash-remote-dev`, so it cannot accidentally replace the connected production Worker.

## Provision production resources

Authenticate Wrangler to the intended Cloudflare account, then create uniquely named production resources:

```powershell
npx wrangler d1 create washpro-production --binding DB --cwd apps/api
npx wrangler r2 bucket create washpro-uploads-production --cwd apps/api
npx wrangler r2 bucket create washpro-invoices-production --cwd apps/api
npx wrangler kv namespace create washpro-cache-production --binding CACHE --cwd apps/api
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

The API workspace runs `scripts/validate-production-deploy.mjs` before every production deployment and before the legacy production `migrate:remote` command. It prevents Wrangler from running until the Worker name, entry point, production origins, D1/KV/R2 bindings, TTLs, and required secret declarations are production-safe. Use `db:migrate:remote-dev` only for the named development database. Secret declarations do not create secret values; confirm all four values exist in Cloudflare before deploying.

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
