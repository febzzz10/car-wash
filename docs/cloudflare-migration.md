# Cloudflare development data migration

This procedure migrates local Wrangler development data only to the named `remote-dev` environment in Cloudflare account `36c28c2516a8d4f17c0d010d6f12bf5f`. It cannot target production: the CLI validates the exact account, environment, D1/KV IDs, and R2 bucket names before reading or writing remote data.

## Target resources

| Binding | Development resource |
| --- | --- |
| `DB` | D1 `washpro-dev` (`f12e4f56-470a-488f-8e34-da502fe974d7`) |
| `CACHE` | KV `washpro-cache-dev` (`72cd173f952343269324e671d68147e6`) |
| `UPLOADS` | private R2 `washpro-uploads-dev` |
| `INVOICES` | private R2 `washpro-invoices-dev` |

The local source remains `apps/api/.wrangler/state`; no custom `--persist-to` path is configured. Stop the local API and web development servers before taking a backup.

## Commands

Run from the repository root:

```powershell
npm run cloudflare:provision:verify
npm run cloudflare:migration:backup
npm run db:migrate:remote-dev
npm run cloudflare:migration:dry-run
npm run cloudflare:migration:execute
npm run cloudflare:migration:verify
```

`cloudflare:migration:dry-run` is read-only. Remote data writes require the explicit `--execute` embedded in `cloudflare:migration:execute`. A rerun is resumable only when every selected remote D1 row count and order-independent content fingerprint equals the backup; otherwise it stops as a conflict. Local integrity and foreign-key checks, remote R2 byte hashes, sizes, HTTP metadata, and custom metadata are preflight gates before D1 import. Verification repeats the D1 and R2 comparisons after execution.

## Backup contents

Every backup is written to `migration-backups/<timestamp>/`, which is git-ignored. It contains:

- the complete copied Wrangler state;
- `washpro-local-full.sql` and a foreign-key-ordered, data-only `washpro-selected-data.sql`;
- separate uploads and invoice R2 manifests with object keys, sizes, hashes, complete HTTP/custom metadata, destinations, and status;
- backup, dry-run, execution, and verification JSON reports;
- `migration.log` with non-sensitive phase summaries.

Never commit or share this directory. It can contain password hashes, customer data, GPS history, photos, invoices, and audit records even though the current snapshot contains no customer/job/file rows.

## Data selection and verification

The migration preserves primary keys, snapshots, dates, money values, invoice numbers, and R2 object keys. It includes application reference data, organizations, branches, users required by foreign keys, settings, customers, vehicles, jobs, financial history, invoices, expenses, file metadata, and audits.

It excludes `_cf_METADATA`, Wrangler/D1 migration bookkeeping, `user_sessions`, login attempts, password-reset tokens, and idempotency records. KV has no permanent allowlist; login throttles, capture challenges, sessions, CSRF state, caches, locks, and expiring links are never copied.

Verification compares each selected table's local and remote row counts, order-independent SHA-256 content fingerprint, ID bounds, and foreign-key check. R2 objects are compared by exact key, byte size, SHA-256, HTTP metadata, and custom metadata; an existing non-identical key is a conflict and is never overwritten. New writes use a create-only R2 condition so a concurrent object cannot be replaced between preflight and upload. The authenticated bridge binds both local or remote buckets to a localhost-only Worker process without deploying it.

The 2026-07-24 source snapshot contained 58 selected rows: 1 organization, 1 branch, 2 users, 26 settings, 9 vehicle types, 10 expense categories, and 9 audit rows. Customer, vehicle, wash-job, invoice, payment, file-asset, and R2 object counts were all zero. All 58 rows migrated; all verification comparisons passed; zero KV keys were copied.
