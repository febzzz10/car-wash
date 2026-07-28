/**
 * Backfill vehicle_models from existing vehicles table.
 *
 * Reads distinct non-null vehicle models per organization, normalizes them,
 * and inserts safe deduplicated entries into vehicle_models.
 *
 * Safe to run multiple times. Does not modify existing vehicles.
 *
 * IMPORTANT:
 * - Backfill is NOT required for vehicles created after migration 0012.
 * - New models are automatically inserted during successful vehicle creation
 *   and editing via the normal API.
 * - Backfill is only needed for vehicle records that existed BEFORE migration
 *   0012 or were imported directly into D1 without using the normal API.
 *
 * LIMITATION: This script requires a Cloudflare Workers D1 binding and
 * crypto.randomUUID(). It CANNOT directly target remote D1 from the
 * command line via pnpm tsx.
 *
 * To run against remote D1, either:
 *   1. Add a temporary admin-only route that calls backfillVehicleModels(db)
 *      and remove it after use.
 *   2. Generate the SQL from the script output and run via:
 *      pnpm --filter @washpro/api exec wrangler d1 execute washpro-dev --remote --command="..."
 */

import { normalizeVehicleModel } from "@washpro/domain";

export interface BackfillReport {
  readonly vehiclesScanned: number;
  readonly distinctValues: number;
  readonly modelsInserted: number;
  readonly duplicatesSkipped: number;
  readonly blanksIgnored: number;
  readonly errors: number;
}

export async function backfillVehicleModels(
  db: import("@cloudflare/workers-types").D1Database,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    vehiclesScanned: 0,
    distinctValues: 0,
    modelsInserted: 0,
    duplicatesSkipped: 0,
    blanksIgnored: 0,
    errors: 0,
  };

  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT organization_id, TRIM(model) AS model
         FROM vehicles
         WHERE model IS NOT NULL AND TRIM(model) != ''
         ORDER BY organization_id, model`,
      )
      .all<{ organization_id: string; model: string }>();

    report.vehiclesScanned = rows.results.length;

    const seen = new Set<string>();

    for (const row of rows.results) {
      const normalized = normalizeVehicleModel(row.model);
      if (normalized === null) {
        report.blanksIgnored++;
        continue;
      }

      report.distinctValues++;
      const key = `${row.organization_id}:${normalized.normalizedName}`;
      if (seen.has(key)) {
        report.duplicatesSkipped++;
        continue;
      }
      seen.add(key);

      try {
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT OR IGNORE INTO vehicle_models
               (id, organization_id, name, normalized_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            row.organization_id,
            normalized.name,
            normalized.normalizedName,
            now,
            now,
          )
          .run();
        report.modelsInserted++;
      } catch {
        report.errors++;
      }
    }
  } catch {
    report.errors++;
  }

  return report;
}
