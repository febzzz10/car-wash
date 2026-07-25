# Backup and restore

WashPro data spans D1 plus two private R2 buckets. A database export alone is not a complete backup because D1 stores only object keys and metadata for photos, receipts, logos, and invoice PDFs.

For the guarded local-Wrangler-to-`remote-dev` migration workflow, use `docs/cloudflare-migration.md`. Its timestamped `migration-backups/` artifacts contain the complete local Wrangler state, full and selected D1 exports, separate R2 manifests, dry-run and verification reports, and a phase log. That directory is intentionally git-ignored because it may contain customer data and private files.

## Backup

1. Retrieve and record the current D1 Time Travel bookmark:

   ```powershell
   npx wrangler d1 time-travel info washpro-production
   ```

2. Export schema and data to an access-controlled backup location:

   ```powershell
   npx wrangler d1 export washpro-production --remote --output backups/washpro-production.sql
   ```

3. Mirror both private R2 buckets using an approved S3-compatible backup tool such as rclone. Preserve object keys, content type, checksums, custom metadata, and version/revision relationships. Encrypt the backup and apply access controls at least as strict as production.
4. Record the D1 bookmark, export checksum, R2 inventory/checksums, application release, migration level, timestamp, and operator in one manifest.
5. Store periodic exports outside the Cloudflare account to cover retention beyond D1 Time Travel. Test restoration on a schedule.

Cloudflare D1 Time Travel is always on for supported production databases and provides point-in-time recovery within the account's retention window; it does not replace an independent, longer-lived backup.

## Restore rehearsal

Always restore to an isolated staging environment first:

1. Provision an empty staging D1 database and private staging R2 buckets.
2. Import the SQL export with `wrangler d1 execute` using the staging binding and `--file`.
3. Restore R2 objects without enabling public access.
4. Apply any migrations newer than the backup.
5. Point a staging Worker at only those staging resources.
6. Run reconciliation and verify object metadata resolves to existing private objects.
7. Test authentication, one historical customer/vehicle/job/invoice chain, totals, refunds, and protected file access.

## Production point-in-time restore

D1 Time Travel overwrites the database in place and cancels in-flight queries. It is destructive and requires explicit approval, a maintenance window, and a fresh backup/bookmark first.

```powershell
npx wrangler d1 time-travel info washpro-production --timestamp <approved-rfc3339-time>
npx wrangler d1 time-travel restore washpro-production --bookmark <approved-bookmark>
```

The angle-bracket values are operator-supplied recovery decisions, never committed configuration. Preserve the pre-restore bookmark returned by Wrangler so the restore can be undone. Restore or roll back R2 independently only when the incident affected objects; a D1 restore does not rewind either bucket.

After any production restore, deploy the matching application version, apply only reviewed migrations, run reconciliation, inspect audit and payment/refund totals, verify protected invoices, and document the incident and evidence.
