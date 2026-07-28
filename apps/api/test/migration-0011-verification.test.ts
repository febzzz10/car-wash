import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// Migration 0011 SQL statements (split by semicolons, transaction wrapper removed
// because D1 exec() doesn't support BEGIN TRANSACTION).
const MIGRATION_STMTS = [
  // Step 1: Drop restrictive triggers
  "DROP TRIGGER IF EXISTS tr_payments_no_delete",
  "DROP TRIGGER IF EXISTS tr_refunds_no_update",
  "DROP TRIGGER IF EXISTS tr_refunds_no_delete",
  "DROP TRIGGER IF EXISTS tr_invoices_no_delete",
  "DROP TRIGGER IF EXISTS tr_invoice_items_no_update",
  "DROP TRIGGER IF EXISTS tr_invoice_items_no_delete",
  "DROP TRIGGER IF EXISTS tr_timer_events_no_delete",
  "DROP TRIGGER IF EXISTS tr_timer_adjustments_no_delete",
  "DROP TRIGGER IF EXISTS tr_referral_reward_transactions_no_delete",
  // Step 2: Delete records in reverse FK dependency order
  "DELETE FROM referral_reward_transactions",
  "DELETE FROM referral_rewards",
  "DELETE FROM referral_redemptions",
  "DELETE FROM coupon_redemptions",
  "DELETE FROM timer_adjustments",
  "DELETE FROM timer_events",
  "DELETE FROM location_captures",
  "DELETE FROM vehicle_photos",
  "DELETE FROM invoice_items",
  "DELETE FROM invoices",
  "DELETE FROM refunds",
  "DELETE FROM payments",
  "DELETE FROM wash_job_items",
  "DELETE FROM wash_jobs",
  "DELETE FROM coupon_eligible_vehicle_types",
  "DELETE FROM service_prices",
  "DELETE FROM vehicles",
  // Step 3: Delete old vehicle types
  "DELETE FROM vehicle_types",
  // Step 4: Insert 3 canonical vehicle types per organization
  `INSERT INTO vehicle_types (id, organization_id, code, name, display_order, is_active, created_at, updated_at)
   SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
     o.id, 'TWO_WHEELER', 'Two Wheeler', 0, 1, datetime('now'), datetime('now')
   FROM organizations o
   UNION ALL
   SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
     o.id, 'THREE_WHEELER', 'Three Wheeler', 1, 1, datetime('now'), datetime('now')
   FROM organizations o
   UNION ALL
   SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
     o.id, 'FOUR_WHEELER', 'Four Wheeler', 2, 1, datetime('now'), datetime('now')
   FROM organizations o`,
  // Step 5: Ensure composite uniqueness index
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_types_org_code ON vehicle_types (organization_id, code)",
  // Step 6: Recreate dropped triggers
  `CREATE TRIGGER tr_payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'payments are append-only'); END`,
  `CREATE TRIGGER tr_invoices_no_delete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT, 'invoices are immutable'); END`,
  `CREATE TRIGGER tr_invoice_items_no_update BEFORE UPDATE ON invoice_items BEGIN SELECT RAISE(ABORT, 'invoice items are immutable'); END`,
  `CREATE TRIGGER tr_invoice_items_no_delete BEFORE DELETE ON invoice_items BEGIN SELECT RAISE(ABORT, 'invoice items are immutable'); END`,
  `CREATE TRIGGER tr_timer_events_no_delete BEFORE DELETE ON timer_events BEGIN SELECT RAISE(ABORT, 'timer events are append-only'); END`,
  `CREATE TRIGGER tr_timer_adjustments_no_delete BEFORE DELETE ON timer_adjustments BEGIN SELECT RAISE(ABORT, 'timer adjustments are append-only'); END`,
  `CREATE TRIGGER tr_refunds_no_update BEFORE UPDATE ON refunds BEGIN SELECT RAISE(ABORT, 'refunds are append-only'); END`,
  `CREATE TRIGGER tr_refunds_no_delete BEFORE DELETE ON refunds BEGIN SELECT RAISE(ABORT, 'refunds are append-only'); END`,
  `CREATE TRIGGER tr_referral_reward_transactions_no_delete BEFORE DELETE ON referral_reward_transactions BEGIN SELECT RAISE(ABORT, 'reward transactions are append-only'); END`,
];

const ORG_1 = "org-1111-1111-1111-111111111111";
const ORG_2 = "org-2222-2222-2222-222222222222";
const BRANCH_1 = "br-1111-1111-1111-111111111111";
const BRANCH_2 = "br-2222-2222-2222-222222222222";
const USER_1 = "usr-1111-1111-1111-111111111111";
const USER_2 = "usr-2222-2222-2222-222222222222";

const LEGACY_CODES = [
  "MOTORBIKE",
  "HATCHBACK",
  "SEDAN",
  "SUV",
  "MUV",
  "VAN",
  "PICKUP",
  "COMMERCIAL",
  "OTHER",
] as const;

const CANONICAL_CODES = [
  "TWO_WHEELER",
  "THREE_WHEELER",
  "FOUR_WHEELER",
] as const;

function vtId(orgIndex: number, typeIndex: number): string {
  return `vt-${orgIndex}-${typeIndex}-${"0".repeat(24)}`;
}

function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function insert(sql: string): Promise<void> {
  await env.DB.prepare(sql).run();
}

async function query<T>(sql: string, ...bind: unknown[]): Promise<T[]> {
  let stmt = env.DB.prepare(sql);
  if (bind.length > 0) stmt = stmt.bind(...bind);
  const result = await stmt.all<T>();
  return result.results;
}

async function first<T>(sql: string, ...bind: unknown[]): Promise<T | null> {
  let stmt = env.DB.prepare(sql);
  if (bind.length > 0) stmt = stmt.bind(...bind);
  return (await stmt.first()) as T | null;
}

describe("migration 0011 consolidation", () => {
  it("seeds legacy data, applies migration 0011, and verifies FK/type integrity", async () => {
    const t = now();

    // Global beforeEach (apply-migrations.ts) already ran,
    // so all schemas are created, all triggers active.
    // Drop ALL triggers so we can seed data freely.
    const allTriggers = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'",
    );
    for (const { name } of allTriggers) {
      await insert(`DROP TRIGGER IF EXISTS ${name}`);
    }

    // === SEED: 2 organizations ===

    await insert(
      `INSERT INTO organizations (id, display_name, status, default_currency, default_timezone, created_at, updated_at, version)
       VALUES ('${ORG_1}', 'Org One', 'ACTIVE', 'INR', 'Asia/Kolkata', '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO organizations (id, display_name, status, default_currency, default_timezone, created_at, updated_at, version)
       VALUES ('${ORG_2}', 'Org Two', 'ACTIVE', 'INR', 'Asia/Kolkata', '${t}', '${t}', 1)`,
    );

    await insert(
      `INSERT INTO branches (id, organization_id, code, name, allowed_radius_meters, minimum_gps_accuracy_meters, is_active, created_at, updated_at, version)
       VALUES ('${BRANCH_1}', '${ORG_1}', 'MAIN', 'Main', 100, 50, 1, '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO branches (id, organization_id, code, name, allowed_radius_meters, minimum_gps_accuracy_meters, is_active, created_at, updated_at, version)
       VALUES ('${BRANCH_2}', '${ORG_2}', 'MAIN', 'Main', 100, 50, 1, '${t}', '${t}', 1)`,
    );

    for (const [i, org] of [ORG_1, ORG_2].entries()) {
      await insert(
        `INSERT INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at, version)
         VALUES ('${[USER_1, USER_2][i]}', '${org}', '${[BRANCH_1, BRANCH_2][i]}', 'Admin', 'admin${i}', 'admin${i}', 'x', 'ADMIN', 'ACTIVE', '${t}', '${t}', 1)`,
      );
    }

    // === SEED: 9 legacy vehicle types per org ===

    for (const [orgIdx, org] of [ORG_1, ORG_2].entries()) {
      for (const [vtIdx, code] of LEGACY_CODES.entries()) {
        await insert(
          `INSERT INTO vehicle_types (id, organization_id, code, name, display_order, is_active, created_at, updated_at, version)
           VALUES ('${vtId(orgIdx, vtIdx)}', '${org}', '${code}', '${code}', ${vtIdx}, 1, '${t}', '${t}', 1)`,
        );
      }
    }

    // === SEED: customers ===

    await insert(
      `INSERT INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, status, registration_source, registered_at, created_at, updated_at, version)
       VALUES ('cust-1', '${ORG_1}', 'John', 'john', '+911111', '+911111', 'ACTIVE', 'STAFF', '${t}', '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, status, registration_source, registered_at, created_at, updated_at, version)
       VALUES ('cust-2', '${ORG_2}', 'Jane', 'jane', '+912222', '+912222', 'ACTIVE', 'STAFF', '${t}', '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, status, registration_source, registered_at, created_at, updated_at, version)
       VALUES ('cust-ref', '${ORG_1}', 'Ref', 'ref', '+913333', '+913333', 'ACTIVE', 'STAFF', '${t}', '${t}', '${t}', 1)`,
    );

    // === SEED: vehicles ===

    await insert(
      `INSERT INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at, version)
       VALUES ('veh-1', '${ORG_1}', 'cust-1', '${vtId(0, 0)}', 'KL01AA1000', 'kl01aa1000', 'ACTIVE', '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at, version)
       VALUES ('veh-2', '${ORG_2}', 'cust-2', '${vtId(1, 0)}', 'KL02BB2000', 'kl02bb2000', 'ACTIVE', '${t}', '${t}', 1)`,
    );

    await insert(
      `INSERT INTO file_assets (id, organization_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, created_at)
       VALUES ('fa-1', '${ORG_1}', 'test', 'test.jpg', 'image/jpeg', 1000, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', '${t}')`,
    );

    await insert(
      `INSERT INTO services (id, organization_id, code, name, service_kind, base_price_minor, display_order, is_active, created_at, updated_at, version)
       VALUES ('svc-1', '${ORG_1}', 'WASH', 'Basic Wash', 'PRIMARY', 5000, 0, 1, '${t}', '${t}', 1)`,
    );

    for (const [orgIdx, org] of [ORG_1, ORG_2].entries()) {
      for (const vtIdx of [0, 3]) {
        await insert(
          `INSERT INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, is_active, effective_from, created_at)
           VALUES ('sp-${orgIdx}-${vtIdx}', '${org}', 'svc-1', '${vtId(orgIdx, vtIdx)}', 5000, 1, '${t}', '${t}')`,
        );
      }
    }

    await insert(
      `INSERT INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, start_at, expires_at, is_active, created_by_user_id, created_at, updated_at, version)
       VALUES ('cpn-1', '${ORG_1}', 'WELCOME', 'welcome', 'PERCENTAGE', 1000, '${t}', '2099-12-31 23:59:59', 1, '${USER_1}', '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO coupon_eligible_vehicle_types (coupon_id, vehicle_type_id)
       VALUES ('cpn-1', '${vtId(0, 0)}')`,
    );
    await insert(
      `INSERT INTO coupon_eligible_vehicle_types (coupon_id, vehicle_type_id)
       VALUES ('cpn-1', '${vtId(0, 3)}')`,
    );

    const wj1 = "wj-0";
    const wj2 = "wj-1";
    for (const [orgIdx, org] of [ORG_1, ORG_2].entries()) {
      await insert(
        `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, payment_status, subtotal_minor, total_amount_minor, paid_amount_minor, balance_minor, currency_code, created_by_user_id, created_at, updated_at, version)
         VALUES ('${[wj1, wj2][orgIdx]}', '${org}', '${[BRANCH_1, BRANCH_2][orgIdx]}', 'REF-${orgIdx}', 'cust-${orgIdx + 1}', 'veh-${orgIdx + 1}', '${[USER_1, USER_2][orgIdx]}', 'Customer', '+911111', 'KL01AA1000', 'SUV', 'COMPLETED', 'PAID', 5000, 5000, 5000, 0, 'INR', '${[USER_1, USER_2][orgIdx]}', '${t}', '${t}', 1)`,
      );
    }

    await insert(
      `INSERT INTO wash_job_items (id, wash_job_id, item_kind, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, line_total_minor, display_order, created_at)
       VALUES ('wji-1', '${wj1}', 'PRIMARY', 'Wash', 1, 5000, 5000, 5000, 0, '${t}')`,
    );

    await insert(
      `INSERT INTO invoices (id, organization_id, branch_id, wash_job_id, invoice_number, revision_number, invoice_status, business_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, subtotal_minor, discount_minor, taxable_amount_minor, tax_minor, total_minor, paid_minor, balance_minor, currency_code, payment_status_snapshot, invoice_snapshot_json, created_at)
       VALUES ('inv-1', '${ORG_1}', '${BRANCH_1}', '${wj1}', 'INV-001', 0, 'ISSUED', 'Test', 'John', '+911111', 'KL01AA1000', 5000, 0, 0, 0, 5000, 5000, 0, 'INR', 'PAID', '{}', '${t}')`,
    );
    await insert(
      `INSERT INTO invoice_items (id, invoice_id, item_kind, item_name, quantity, unit_price_minor, subtotal_minor, total_minor, display_order)
       VALUES ('ii-1', 'inv-1', 'PRIMARY', 'Wash', 1, 5000, 5000, 5000, 0)`,
    );

    await insert(
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, payment_reference, transaction_type, amount_minor, payment_method, status, received_by_user_id, created_at)
       VALUES ('pmt-1', '${ORG_1}', '${BRANCH_1}', '${wj1}', 'PAY-001', 'PAYMENT', 5000, 'CASH', 'SUCCESS', '${USER_1}', '${t}')`,
    );

    await insert(
      `INSERT INTO refunds (id, organization_id, branch_id, payment_id, wash_job_id, amount_minor, status, reason, approved_by_user_id, created_at)
       VALUES ('ref-1', '${ORG_1}', '${BRANCH_1}', 'pmt-1', '${wj1}', 1000, 'SUCCESS', 'Overcharge', '${USER_1}', '${t}')`,
    );

    await insert(
      `INSERT INTO timer_events (id, wash_job_id, event_type, event_at, performed_by_user_id, created_at)
       VALUES ('te-1', '${wj1}', 'START', '${t}', '${USER_1}', '${t}')`,
    );
    await insert(
      `INSERT INTO timer_events (id, wash_job_id, event_type, event_at, performed_by_user_id, created_at)
       VALUES ('te-2', '${wj1}', 'END', '${t}', '${USER_1}', '${t}')`,
    );
    await insert(
      `INSERT INTO timer_adjustments (id, wash_job_id, adjustment_type, previous_value, new_value, reason, approved_by_user_id, created_at)
       VALUES ('ta-1', '${wj1}', 'START_TIME_CORRECTION', '30', '60', 'Manual fix', '${USER_1}', '${t}')`,
    );

    await insert(
      `INSERT INTO vehicle_photos (id, organization_id, vehicle_id, customer_id, file_asset_id, photo_type, capture_source, created_at)
       VALUES ('vp-1', '${ORG_1}', 'veh-1', 'cust-1', 'fa-1', 'LIVE_BEFORE_WASH', 'CAMERA', '${t}')`,
    );
    await insert(
      `INSERT INTO location_captures (id, organization_id, branch_id, wash_job_id, latitude, longitude, accuracy_meters, captured_at, captured_by_user_id, verification_status, created_at)
       VALUES ('lc-1', '${ORG_1}', '${BRANCH_1}', '${wj1}', 9.98, 76.3, 10, '${t}', '${USER_1}', 'AT_BUSINESS_LOCATION', '${t}')`,
    );

    await insert(
      `INSERT INTO referral_codes (id, organization_id, customer_id, code, code_normalized, issued_at, created_at, updated_at)
       VALUES ('rc-1', '${ORG_1}', 'cust-1', 'REFCODE', 'refcode', '${t}', '${t}', '${t}')`,
    );
    await insert(
      `INSERT INTO referral_redemptions (id, organization_id, referral_code_id, referring_customer_id, referred_customer_id, referred_wash_job_id, status, friend_discount_type_snapshot, friend_discount_value_snapshot, friend_discount_minor, reward_type_snapshot, reward_value_snapshot, created_by_user_id, created_at)
       VALUES ('rred-1', '${ORG_1}', 'rc-1', 'cust-1', 'cust-ref', '${wj1}', 'PENDING', 'FIXED', 500, 500, 'FIXED', 500, '${USER_1}', '${t}')`,
    );
    await insert(
      `INSERT INTO referral_rewards (id, organization_id, customer_id, referral_redemption_id, status, original_amount_minor, remaining_amount_minor, created_at, updated_at, version)
       VALUES ('rr-1', '${ORG_1}', 'cust-1', 'rred-1', 'AVAILABLE', 500, 500, '${t}', '${t}', 1)`,
    );
    await insert(
      `INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, transaction_type, amount_minor, balance_after_minor, created_at)
       VALUES ('rrt-1', 'rr-1', 'cust-1', 'EARN', 500, 500, '${t}')`,
    );

    // === VERIFY SEED DATA ===

    const orgCounts = await query<{ organization_id: string; cnt: number }>(
      "SELECT organization_id, COUNT(*) AS cnt FROM vehicle_types GROUP BY organization_id ORDER BY organization_id",
    );
    expect(orgCounts).toHaveLength(2);
    for (const row of orgCounts) {
      expect(row.cnt).toBe(9);
    }

    const pmtCount = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM payments",
    );
    expect(pmtCount!.cnt).toBe(1);

    const vhCount = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM vehicles",
    );
    expect(vhCount!.cnt).toBe(2);

    // === APPLY MIGRATION 0011 (statement by statement) ===

    for (const stmt of MIGRATION_STMTS) {
      await env.DB.prepare(stmt).run();
    }

    // === VERIFICATION 1: PRAGMA foreign_key_check ===

    const fkResult = await query<Record<string, unknown>>(
      "PRAGMA foreign_key_check",
    );
    expect(fkResult).toHaveLength(0);

    // === VERIFICATION 2: Every org has exactly 3 vehicle types ===

    const vtCounts = await query<{ organization_id: string; cnt: number }>(
      "SELECT organization_id, COUNT(*) AS cnt FROM vehicle_types GROUP BY organization_id ORDER BY organization_id",
    );
    expect(vtCounts).toHaveLength(2);
    for (const row of vtCounts) {
      expect(row.cnt).toBe(3);
    }

    // === VERIFICATION 3: Codes are canonical only ===

    const vtCodes = await query<{ organization_id: string; code: string }>(
      "SELECT organization_id, code FROM vehicle_types ORDER BY organization_id, code",
    );
    const codesByOrg = new Map<string, string[]>();
    for (const row of vtCodes) {
      const codes = codesByOrg.get(row.organization_id) ?? [];
      codes.push(row.code);
      codesByOrg.set(row.organization_id, codes);
    }
    for (const [, codes] of codesByOrg) {
      expect(codes).toEqual(["FOUR_WHEELER", "THREE_WHEELER", "TWO_WHEELER"]);
    }

    // === VERIFICATION 4: No legacy codes remain ===

    const legacyCount = await first<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM vehicle_types WHERE code IN (${LEGACY_CODES.map(() => "?").join(",")})`,
      ...LEGACY_CODES,
    );
    expect(legacyCount!.cnt).toBe(0);

    // === VERIFICATION 5: Total = 2 orgs x 3 types ===

    const totalVt = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM vehicle_types",
    );
    expect(totalVt!.cnt).toBe(6);

    // === VERIFICATION 6: FK-dependent rows were cleaned ===

    const remainingVeh = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM vehicles",
    );
    expect(remainingVeh!.cnt).toBe(0);

    const remainingPmt = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM payments",
    );
    expect(remainingPmt!.cnt).toBe(0);

    const remainingWj = await first<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM wash_jobs",
    );
    expect(remainingWj!.cnt).toBe(0);

    // === VERIFICATION 7: Organizations preserved ===

    const orgResult = await query<{ id: string }>(
      "SELECT id FROM organizations ORDER BY id",
    );
    expect(orgResult).toHaveLength(2);
    expect(orgResult[0]!.id).toBe(ORG_1);
    expect(orgResult[1]!.id).toBe(ORG_2);

    // === VERIFICATION 8: All migration-managed triggers exist ===

    const triggerRows = await query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    );
    const triggerNames = new Set(triggerRows.map((r) => r.name));
    const recreatedTriggers = [
      "tr_payments_no_delete",
      "tr_invoices_no_delete",
      "tr_invoice_items_no_update",
      "tr_invoice_items_no_delete",
      "tr_timer_events_no_delete",
      "tr_timer_adjustments_no_delete",
      "tr_refunds_no_update",
      "tr_refunds_no_delete",
      "tr_referral_reward_transactions_no_delete",
    ];
    for (const name of recreatedTriggers) {
      expect(triggerNames.has(name)).toBe(true);
    }

    const triggerSql = new Map(triggerRows.map((r) => [r.name, r.sql]));
    expect(triggerSql.get("tr_payments_no_delete")).toContain(
      "payments are append-only",
    );
    expect(triggerSql.get("tr_invoices_no_delete")).toContain(
      "invoices are immutable",
    );
    expect(triggerSql.get("tr_invoice_items_no_update")).toContain(
      "invoice items are immutable",
    );
    expect(triggerSql.get("tr_invoice_items_no_delete")).toContain(
      "invoice items are immutable",
    );
    expect(triggerSql.get("tr_timer_events_no_delete")).toContain(
      "timer events are append-only",
    );
    expect(triggerSql.get("tr_timer_adjustments_no_delete")).toContain(
      "timer adjustments are append-only",
    );
    expect(triggerSql.get("tr_refunds_no_update")).toContain(
      "refunds are append-only",
    );
    expect(triggerSql.get("tr_refunds_no_delete")).toContain(
      "refunds are append-only",
    );
    expect(
      triggerSql.get("tr_referral_reward_transactions_no_delete"),
    ).toContain("reward transactions are append-only");

    // === VERIFICATION 9: UNIQUE (organization_id, code) enforced ===

    const existingVt = await first<{ code: string }>(
      "SELECT code FROM vehicle_types WHERE organization_id = ? LIMIT 1",
      ORG_1,
    );
    expect(existingVt).not.toBeNull();

    let caught = false;
    try {
      await insert(
        `INSERT INTO vehicle_types (id, organization_id, code, name, display_order, is_active, created_at, updated_at, version)
         VALUES ('dup-vt', '${ORG_1}', '${existingVt!.code}', 'Dup', 0, 1, datetime('now'), datetime('now'), 1)`,
      );
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);

    // === VERIFICATION 10: Re-seeding is idempotent ===

    const org1CodesBefore = (await query<{ code: string }>(
      "SELECT code FROM vehicle_types WHERE organization_id = ? ORDER BY code",
      ORG_1,
    )).map((r) => r.code);
    expect(org1CodesBefore).toHaveLength(3);

    for (const cc of CANONICAL_CODES) {
      await insert(
        `INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, display_order, is_active, created_at, updated_at, version)
         VALUES (lower(hex(randomblob(16))), '${ORG_1}', '${cc}', '${cc}', ${["TWO_WHEELER", "THREE_WHEELER", "FOUR_WHEELER"].indexOf(cc)}, 1, datetime('now'), datetime('now'), 1)`,
      );
    }

    const org1CodesAfter = (await query<{ code: string }>(
      "SELECT code FROM vehicle_types WHERE organization_id = ? ORDER BY code",
      ORG_1,
    )).map((r) => r.code);
    expect(org1CodesAfter).toHaveLength(3);
    expect(org1CodesAfter).toEqual(["FOUR_WHEELER", "THREE_WHEELER", "TWO_WHEELER"]);
  });
});
