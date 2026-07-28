import { normalizeVehicleMake } from "@washpro/domain";

export interface BackfillReport {
  readonly vehiclesScanned: number;
  readonly distinctValues: number;
  readonly makesInserted: number;
  readonly duplicatesSkipped: number;
  readonly blanksIgnored: number;
  readonly errors: number;
}

export async function backfillVehicleMakes(
  db: import("@cloudflare/workers-types").D1Database,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    vehiclesScanned: 0,
    distinctValues: 0,
    makesInserted: 0,
    duplicatesSkipped: 0,
    blanksIgnored: 0,
    errors: 0,
  };

  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT organization_id, TRIM(make) AS make
         FROM vehicles
         WHERE make IS NOT NULL AND TRIM(make) != ''
         ORDER BY organization_id, make`,
      )
      .all<{ organization_id: string; make: string }>();

    report.vehiclesScanned = rows.results.length;

    const seen = new Set<string>();

    for (const row of rows.results) {
      const normalized = normalizeVehicleMake(row.make);
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
            `INSERT OR IGNORE INTO vehicle_makes
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
        report.makesInserted++;
      } catch {
        report.errors++;
      }
    }
  } catch {
    report.errors++;
  }

  return report;
}
