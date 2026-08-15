import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashSessionToken } from "../src/security/tokens";

const rawToken = "payment-list-pagination-session";
const timestamp = "2026-07-23T11:00:00.000Z";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ListBody {
  readonly data: {
    readonly payments: readonly { id: string }[];
    readonly pagination: {
      readonly hasNext: boolean;
      readonly limit: number;
      readonly nextCursor: string | null;
    };
  };
}

function paymentInsert(
  id: string,
  organizationId: string,
  branchId: string,
  jobId: string,
  collectorId: string | null,
  collectorName: string | null,
  paidAt: string | null,
  createdAt: string,
  overrides?: Partial<{ method: string; status: string; tip: number }>,
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO payments (
      id, organization_id, branch_id, wash_job_id, transaction_type,
      amount_minor, tip_minor, payment_method, status, paid_at,
      received_by_user_id, collected_by_user_id, collected_by_name_snapshot,
      idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, 'PAYMENT', 100, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    organizationId,
    branchId,
    jobId,
    overrides?.tip ?? 0,
    overrides?.method ?? "CASH",
    overrides?.status ?? "SUCCESS",
    paidAt,
    "staff-paypg-a",
    collectorId,
    collectorName,
    `paypg-${id}`,
    createdAt,
  );
}

function washJobInsert(
  id: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  vehicleId: string,
  assignedUserId: string,
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO wash_jobs (
      id, organization_id, branch_id, job_reference, customer_id, vehicle_id,
      assigned_user_id, customer_name_snapshot, customer_phone_snapshot,
      vehicle_registration_snapshot, vehicle_type_name_snapshot, status,
      payment_status, subtotal_minor, total_discount_minor,
      taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor,
      refunded_amount_minor, balance_minor, created_by_user_id, created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pager Owner', '9180000001',
      'KL 05 PG 0001', 'Four Wheeler', 'COMPLETED', 'PAID', 1000000000, 0,
      1000000000, 0, 1000000000, 0, 0, 1000000000, ?, ?, ?)`,
  ).bind(
    id,
    organizationId,
    branchId,
    `WJ-${id}`,
    customerId,
    vehicleId,
    assignedUserId,
    assignedUserId,
    timestamp,
    timestamp,
  );
}

function orgSeeds(
  orgId: string,
  branchId: string,
  adminId: string,
  staffId: string | null,
  sessionTokenHash: string,
  staffTokenHash: string | null,
): ReturnType<typeof env.DB.prepare>[] {
  const statements: ReturnType<typeof env.DB.prepare>[] = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).bind(orgId, `${orgId} Org`, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'MAIN', 'Main', ?, ?)",
    ).bind(branchId, orgId, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'unused', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(
      adminId,
      orgId,
      branchId,
      `${orgId} Admin`,
      adminId,
      adminId,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(
      `session-${adminId}`,
      orgId,
      adminId,
      sessionTokenHash,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, status, registered_at, created_at, updated_at) VALUES (?, ?, ?, 'Pager Owner', 'pager owner', '9180000001', '+9180000001', 'ACTIVE', ?, ?, ?)",
    ).bind(
      `customer-${orgId}`,
      orgId,
      branchId,
      timestamp,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(`type-${orgId}`, orgId, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES (?, ?, ?, ?, 'KL 05 PG 0001', 'KL05PG0001', 'Tata', 'Nexon', ?, ?)",
    ).bind(
      `vehicle-${orgId}`,
      orgId,
      `customer-${orgId}`,
      `type-${orgId}`,
      timestamp,
      timestamp,
    ),
    washJobInsert(
      `job-${orgId}`,
      orgId,
      branchId,
      `customer-${orgId}`,
      `vehicle-${orgId}`,
      adminId,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'Collector A', ?, ?, 'unused', 'STAFF', 'ACTIVE', ?, ?)`,
    ).bind(
      "staff-paypg-a",
      orgId,
      branchId,
      "staff-paypg-a",
      "staff-paypg-a",
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'Collector B', ?, ?, 'unused', 'STAFF', 'ACTIVE', ?, ?)`,
    ).bind(
      "staff-paypg-b",
      orgId,
      branchId,
      "staff-paypg-b",
      "staff-paypg-b",
      timestamp,
      timestamp,
    ),
  ];
  if (staffId !== null) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (
          id, organization_id, default_branch_id, full_name, username,
          username_normalized, password_hash, role, status, permissions_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'unused', 'STAFF', 'ACTIVE', '["payments.create"]', ?, ?)`,
      ).bind(
        staffId,
        orgId,
        branchId,
        `${orgId} Staff`,
        staffId,
        staffId,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO user_sessions (
          id, organization_id, user_id, token_hash, status, created_at,
          last_seen_at, expires_at
        ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
      ).bind(
        `session-${staffId}`,
        orgId,
        staffId,
        staffTokenHash,
        timestamp,
        timestamp,
      ),
    );
  }
  return statements;
}

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const otherTokenHash = await hashSessionToken(
    "payment-list-pagination-other-session",
    env.SESSION_PEPPER,
  );
  const staffTokenHash = await hashSessionToken(
    "payment-list-pagination-staff-session",
    env.SESSION_PEPPER,
  );
  const statements: ReturnType<typeof env.DB.prepare>[] = [
    ...orgSeeds(
      "org-paypg",
      "branch-paypg",
      "admin-paypg",
      "staff-paypg",
      tokenHash,
      staffTokenHash,
    ),
    ...orgSeeds(
      "org-paypg-other",
      "branch-paypg-other",
      "admin-paypg-other",
      null,
      otherTokenHash,
      null,
    ),
  ];
  for (let i = 1; i <= 36; i++) {
    statements.push(
      paymentInsert(
        `payment-paypg-${pad(i)}`,
        "org-paypg",
        "branch-paypg",
        "job-org-paypg",
        "staff-paypg-a",
        "Collector A",
        `2026-02-10T10:${pad(i)}:00.000Z`,
        `2026-01-01T00:${pad(i - 1)}:00.000Z`,
      ),
    );
  }
  for (let i = 1; i <= 3; i++) {
    statements.push(
      paymentInsert(
        `payment-paypg-tie-${i}`,
        "org-paypg",
        "branch-paypg",
        "job-org-paypg",
        "staff-paypg-a",
        "Collector A",
        `2026-02-10T11:0${i}:00.000Z`,
        "2026-01-01T01:00:00.000Z",
      ),
    );
  }
  statements.push(
    paymentInsert(
      "payment-paypg-beta",
      "org-paypg",
      "branch-paypg",
      "job-org-paypg",
      "staff-paypg-b",
      "Collector B",
      "2026-02-10T09:00:00.000Z",
      "2025-12-31T23:59:00.000Z",
    ),
    paymentInsert(
      "payment-paypg-boundary-from",
      "org-paypg",
      "branch-paypg",
      "job-org-paypg",
      "staff-paypg-a",
      "Collector A",
      "2026-07-31T18:30:00.000Z",
      "2025-12-31T23:58:00.000Z",
    ),
    paymentInsert(
      "payment-paypg-boundary-to-last",
      "org-paypg",
      "branch-paypg",
      "job-org-paypg",
      "staff-paypg-a",
      "Collector A",
      "2026-08-01T18:29:59.000Z",
      "2025-12-31T23:57:00.000Z",
    ),
    paymentInsert(
      "payment-paypg-after-to",
      "org-paypg",
      "branch-paypg",
      "job-org-paypg",
      "staff-paypg-a",
      "Collector A",
      "2026-08-01T18:30:00.000Z",
      "2025-12-31T23:56:00.000Z",
    ),
    paymentInsert(
      "payment-paypg-before-from",
      "org-paypg",
      "branch-paypg",
      "job-org-paypg",
      "staff-paypg-a",
      "Collector A",
      "2026-07-31T18:29:59.000Z",
      "2025-12-31T23:55:00.000Z",
    ),
    paymentInsert(
      "payment-xother-1",
      "org-paypg-other",
      "branch-paypg-other",
      "job-org-paypg-other",
      null,
      null,
      "2025-01-01T00:00:00.000Z",
      "2025-01-01T00:00:00.000Z",
    ),
    paymentInsert(
      "payment-xother-2",
      "org-paypg-other",
      "branch-paypg-other",
      "job-org-paypg-other",
      null,
      null,
      "2025-01-01T00:01:00.000Z",
      "2025-01-01T00:01:00.000Z",
    ),
  );
  await env.DB.batch(statements);
});

async function adminHeaders(): Promise<Record<string, string>> {
  return { cookie: `__Host-washpro_session=${rawToken}` };
}

async function otherHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=payment-list-pagination-other-session`,
  };
}

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=payment-list-pagination-staff-session`,
  };
}

async function list(
  url: string,
  headers: Record<string, string>,
): Promise<{ body: ListBody; status: number }> {
  const response = await app.request(url, { headers }, env);
  return {
    body: (await response.json<ListBody>()) as ListBody,
    status: response.status,
  };
}

describe("payment list server-side pagination", () => {
  it("paginates, filters, scopes, and validates", async () => {
    const headers = await adminHeaders();

    // --- nested wire envelope shape ---
    let page = await list("/api/v1/payments?limit=15", headers);
    expect(page.status).toBe(200);
    const rawBody = await (
      await app.request("/api/v1/payments?limit=15", { headers }, env)
    ).json<{
      readonly data: { readonly payments: readonly unknown[] };
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(Array.isArray(rawBody.data.payments)).toBe(true);
    expect(rawBody.pagination).toBeUndefined();
    expect(rawBody.success).toBe(true);
    expect(page.body.data.payments).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);
    expect(page.body.data.pagination.hasNext).toBe(true);
    expect(page.body.data.pagination.nextCursor).toBeTruthy();
    expect(page.body.data.payments[0]!.id).toBe("payment-paypg-tie-3");
    expect(page.body.data.payments[1]!.id).toBe("payment-paypg-tie-2");
    expect(page.body.data.payments[2]!.id).toBe("payment-paypg-tie-1");
    expect(page.body.data.payments[3]!.id).toBe("payment-paypg-36");
    expect(page.body.data.payments[14]!.id).toBe("payment-paypg-25");

    // --- row fields required by the page survive the SELECT change ---
    const firstRow = (
      await (
        await app.request("/api/v1/payments?limit=15", { headers }, env)
      ).json<{
        readonly data: {
          readonly payments: readonly Record<string, unknown>[];
        };
      }>()
    ).data.payments[0]!;
    for (const field of [
      "id",
      "wash_job_id",
      "job_reference",
      "customer_name_snapshot",
      "vehicle_registration_snapshot",
      "payment_status",
      "amount_minor",
      "tip_minor",
      "payment_method",
      "status",
      "paid_at",
      "collected_by_name_snapshot",
      "created_at",
    ]) {
      expect(field in firstRow).toBe(true);
    }

    // --- walk every page: no duplicates, no missing payments ---
    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    let lastBody: ListBody = page.body;
    do {
      const url =
        cursor === null
          ? "/api/v1/payments?limit=15"
          : `/api/v1/payments?limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      expect(next.status).toBe(200);
      expect(next.body.data.payments.length).toBeLessThanOrEqual(15);
      for (const row of next.body.data.payments) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      lastBody = next.body;
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(seen.size).toBe(44);
    for (let i = 1; i <= 36; i++) {
      expect(seen.has(`payment-paypg-${pad(i)}`)).toBe(true);
    }
    for (let i = 1; i <= 3; i++) {
      expect(seen.has(`payment-paypg-tie-${i}`)).toBe(true);
    }
    expect(lastBody.data.pagination.hasNext).toBe(false);
    expect(lastBody.data.pagination.nextCursor).toBeNull();
    expect(lastBody.data.payments.map((row) => row.id)).toEqual([
      "payment-paypg-09",
      "payment-paypg-08",
      "payment-paypg-07",
      "payment-paypg-06",
      "payment-paypg-05",
      "payment-paypg-04",
      "payment-paypg-03",
      "payment-paypg-02",
      "payment-paypg-01",
      "payment-paypg-beta",
      "payment-paypg-boundary-from",
      "payment-paypg-boundary-to-last",
      "payment-paypg-after-to",
      "payment-paypg-before-from",
    ]);

    // --- explicit page sizes ---
    page = await list("/api/v1/payments?limit=25", headers);
    expect(page.body.data.payments).toHaveLength(25);
    expect(page.body.data.pagination.limit).toBe(25);
    expect(page.body.data.pagination.hasNext).toBe(true);
    page = await list("/api/v1/payments?limit=50", headers);
    expect(page.body.data.payments).toHaveLength(44);
    expect(page.body.data.pagination.limit).toBe(50);
    expect(page.body.data.pagination.hasNext).toBe(false);

    // --- excessive limits are clamped to 50 ---
    page = await list("/api/v1/payments?limit=100", headers);
    expect(page.body.data.payments.length).toBeLessThanOrEqual(50);
    expect(page.body.data.pagination.limit).toBe(50);
    page = await list("/api/v1/payments?limit=100000", headers);
    expect(page.body.data.payments.length).toBeLessThanOrEqual(50);
    expect(page.body.data.pagination.limit).toBe(50);

    // --- invalid limits fall back to 15 ---
    for (const bad of ["0", "-5", "abc", "12.5"]) {
      page = await list(`/api/v1/payments?limit=${bad}`, headers);
      expect(page.body.data.payments).toHaveLength(15);
      expect(page.body.data.pagination.limit).toBe(15);
    }

    // --- exact-boundary page ---
    page = await list("/api/v1/payments?limit=20", headers);
    expect(page.body.data.payments).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const boundaryCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/payments?limit=20&cursor=${encodeURIComponent(boundaryCursor)}`,
      headers,
    );
    expect(page.body.data.payments).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const finalCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/payments?limit=20&cursor=${encodeURIComponent(finalCursor)}`,
      headers,
    );
    expect(page.body.data.payments).toHaveLength(4);
    expect(page.body.data.pagination.hasNext).toBe(false);
    expect(page.body.data.pagination.nextCursor).toBeNull();

    // --- identical sort values straddle the page boundary ---
    const tieOrder: string[] = [];
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/payments?limit=2"
          : `/api/v1/payments?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      tieOrder.push(...next.body.data.payments.map((row) => row.id));
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(40);
    } while (cursor !== null);
    expect(tieOrder.slice(0, 3)).toEqual([
      "payment-paypg-tie-3",
      "payment-paypg-tie-2",
      "payment-paypg-tie-1",
    ]);
    expect(new Set(tieOrder).size).toBe(44);

    // --- date filters use the business timezone (Asia/Kolkata default) ---
    // IST midnight 2026-08-01 = 2026-07-31T18:30:00Z; to-exclusive =
    // IST midnight 2026-08-02 = 2026-08-01T18:30:00Z. The row at exactly
    // the to-exclusive instant (after-to) and the row one second before the
    // from boundary (before-from) are excluded; the row exactly at the from
    // boundary and the row in the final second of To are included.
    const augInRange = [
      "payment-paypg-boundary-from",
      "payment-paypg-boundary-to-last",
    ];
    page = await list(
      "/api/v1/payments?from=2026-08-01&to=2026-08-01&limit=50",
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments.map((row) => row.id).sort()).toEqual(
      augInRange.slice().sort(),
    );

    page = await list("/api/v1/payments?from=2026-08-01&limit=50", headers);
    expect(page.body.data.payments.map((row) => row.id).sort()).toEqual(
      [
        "payment-paypg-after-to",
        "payment-paypg-boundary-from",
        "payment-paypg-boundary-to-last",
      ].sort(),
    );

    page = await list("/api/v1/payments?to=2026-08-01&limit=50", headers);
    expect(page.body.data.payments.length).toBe(43);
    expect(
      page.body.data.payments.some(
        (row) => row.id === "payment-paypg-after-to",
      ),
    ).toBe(false);

    // --- multi-page filtered walk: date range 2026-02-10 (40 rows) ---
    const rangeSeen = new Set<string>();
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/payments?from=2026-02-10&to=2026-02-10&limit=15"
          : `/api/v1/payments?from=2026-02-10&to=2026-02-10&limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      expect(next.status).toBe(200);
      for (const row of next.body.data.payments) {
        expect(rangeSeen.has(row.id)).toBe(false);
        rangeSeen.add(row.id);
      }
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(rangeSeen.size).toBe(40);
    expect(rangeSeen.has("payment-paypg-before-from")).toBe(false);
    expect(rangeSeen.has("payment-paypg-boundary-from")).toBe(false);

    // --- collected-by filter: Collector B only ---
    page = await list(
      "/api/v1/payments?assignedUserId=staff-paypg-b&limit=15",
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments.map((row) => row.id)).toEqual([
      "payment-paypg-beta",
    ]);

    // --- collected-by filter with pagination: Collector A has 39 rows ---
    const collectorSeen = new Set<string>();
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/payments?assignedUserId=staff-paypg-a&limit=15"
          : `/api/v1/payments?assignedUserId=staff-paypg-a&limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      for (const row of next.body.data.payments) {
        expect(collectorSeen.has(row.id)).toBe(false);
        collectorSeen.add(row.id);
      }
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(collectorSeen.size).toBe(43);
    expect(collectorSeen.has("payment-paypg-beta")).toBe(false);

    // --- combined date range + collector ---
    page = await list(
      "/api/v1/payments?from=2026-02-10&to=2026-02-10&assignedUserId=staff-paypg-b&limit=15",
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments.map((row) => row.id)).toEqual([
      "payment-paypg-beta",
    ]);
    const combinedRaw = await (
      await app.request(
        "/api/v1/payments?from=2026-02-10&to=2026-02-10&assignedUserId=staff-paypg-a&limit=50",
        { headers },
        env,
      )
    ).json<{
      readonly data: {
        readonly payments: readonly { collected_by_user_id: string | null }[];
      };
    }>();
    expect(combinedRaw.data.payments).toHaveLength(39);
    for (const row of combinedRaw.data.payments) {
      expect(row.collected_by_user_id).toBe("staff-paypg-a");
    }

    // --- filter/cursor isolation: a cursor from the unfiltered list used
    // with date filters still obeys the filters ---
    const unfilteredCursor = (await list("/api/v1/payments?limit=15", headers))
      .body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/payments?from=2026-08-01&to=2026-08-01&cursor=${encodeURIComponent(unfilteredCursor)}&limit=15`,
      headers,
    );
    expect(page.status).toBe(200);
    for (const row of page.body.data.payments) {
      expect([
        "payment-paypg-boundary-from",
        "payment-paypg-boundary-to-last",
      ]).toContain(row.id);
    }
    expect(
      page.body.data.payments.some((row) => row.id === "payment-paypg-36"),
    ).toBe(false);

    // --- organization isolation: cursors never cross tenants ---
    const other = await otherHeaders();
    page = await list("/api/v1/payments?limit=15", other);
    expect(page.status).toBe(200);
    expect(page.body.data.payments).toHaveLength(2);
    expect(page.body.data.payments.map((row) => row.id).sort()).toEqual([
      "payment-xother-1",
      "payment-xother-2",
    ]);
    const paypgCursor = (await list("/api/v1/payments?limit=15", headers)).body
      .data.pagination.nextCursor!;
    page = await list(
      `/api/v1/payments?cursor=${encodeURIComponent(paypgCursor)}&limit=15`,
      other,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments).toHaveLength(2);
    for (const row of page.body.data.payments) {
      expect(row.id.startsWith("payment-paypg-")).toBe(false);
      expect(row.id.startsWith("payment-xother-")).toBe(true);
    }

    // --- invalid cursors are rejected cleanly ---
    for (const bad of [
      "/api/v1/payments?cursor=not-valid-base64!!",
      `/api/v1/payments?cursor=${encodeURIComponent(btoa("no-separator"))}`,
      `/api/v1/payments?cursor=${encodeURIComponent(btoa("|id"))}`,
      `/api/v1/payments?cursor=${encodeURIComponent(btoa("value|"))}`,
      `/api/v1/payments?cursor=${"a".repeat(600)}`,
    ]) {
      const invalid = await list(bad, headers);
      expect(invalid.status).toBe(400);
      const errorBody = await (
        await app.request(bad, { headers }, env)
      ).json<{ error: { code: string } }>();
      expect(errorBody.error.code).toBe("VALIDATION_ERROR");
    }

    // --- structurally valid but meaningless cursors are harmless ---
    page = await list(
      `/api/v1/payments?cursor=${encodeURIComponent(btoa("0000-00-00T00:00:00.000Z|zzz"))}`,
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments).toHaveLength(0);
    expect(page.body.data.pagination.hasNext).toBe(false);
    expect(page.body.data.pagination.nextCursor).toBeNull();

    // --- empty filtered result returns the pagination envelope ---
    page = await list(
      "/api/v1/payments?from=2020-01-01&to=2020-01-01&limit=15",
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.payments).toHaveLength(0);
    expect(page.body.data.pagination).toEqual({
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });

    // --- unauthenticated requests are rejected ---
    const anonymous = await app.request(
      "/api/v1/payments",
      {
        headers: { origin: "https://washpro.test" },
      },
      env,
    );
    expect(anonymous.status).toBe(401);

    // --- staff keep unfiltered list access but cannot use filters ---
    const staff = await staffHeaders();
    const staffPage = await list("/api/v1/payments?limit=15", staff);
    expect(staffPage.status).toBe(200);
    expect(staffPage.body.data.payments).toHaveLength(15);
    const staffFiltered = await app.request(
      "/api/v1/payments?from=2026-08-01&limit=15",
      { headers: staff },
      env,
    );
    expect(staffFiltered.status).toBe(403);
    expect(
      (await staffFiltered.json<{ error: { code: string } }>()).error.code,
    ).toBe("AUTH_PERMISSION_DENIED");
  });

  it("serves the legacy rollout-compatibility shape for pre-pagination requests", async () => {
    const headers = await adminHeaders();

    // --- legacy unfiltered: bare array, old cap, old ordering, no metadata ---
    const legacy = await (
      await app.request("/api/v1/payments", { headers }, env)
    ).json<{
      readonly data: readonly { id: string }[];
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(legacy.success).toBe(true);
    expect(Array.isArray(legacy.data)).toBe(true);
    expect(legacy.data).toHaveLength(44);
    expect(legacy.pagination).toBeUndefined();
    expect(
      legacy.data
        .slice(0, 3)
        .every((row) => row.id.startsWith("payment-paypg-tie-")),
    ).toBe(true);
    expect(legacy.data[3]!.id).toBe("payment-paypg-36");
    expect(legacy.data[43]!.id).toBe("payment-paypg-before-from");

    // --- legacy From filter (business timezone preserved) ---
    const legacyFrom = await (
      await app.request("/api/v1/payments?from=2026-08-01", { headers }, env)
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyFrom.success).toBe(true);
    expect(Array.isArray(legacyFrom.data)).toBe(true);
    expect(legacyFrom.data.map((row) => row.id).sort()).toEqual(
      [
        "payment-paypg-after-to",
        "payment-paypg-boundary-from",
        "payment-paypg-boundary-to-last",
      ].sort(),
    );

    // --- legacy To filter ---
    const legacyTo = await (
      await app.request("/api/v1/payments?to=2026-08-01", { headers }, env)
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyTo.success).toBe(true);
    expect(Array.isArray(legacyTo.data)).toBe(true);
    expect(legacyTo.data).toHaveLength(43);
    expect(
      legacyTo.data.some((row) => row.id === "payment-paypg-after-to"),
    ).toBe(false);

    // --- legacy date range ---
    const legacyRange = await (
      await app.request(
        "/api/v1/payments?from=2026-08-01&to=2026-08-01",
        { headers },
        env,
      )
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyRange.success).toBe(true);
    expect(legacyRange.data.map((row) => row.id).sort()).toEqual([
      "payment-paypg-boundary-from",
      "payment-paypg-boundary-to-last",
    ]);

    // --- legacy collected-by filter ---
    const legacyCollector = await (
      await app.request(
        "/api/v1/payments?assignedUserId=staff-paypg-b",
        { headers },
        env,
      )
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyCollector.success).toBe(true);
    expect(legacyCollector.data.map((row) => row.id)).toEqual([
      "payment-paypg-beta",
    ]);

    // --- legacy combined filters ---
    const legacyCombined = await (
      await app.request(
        "/api/v1/payments?from=2026-02-10&to=2026-02-10&assignedUserId=staff-paypg-a",
        { headers },
        env,
      )
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyCombined.success).toBe(true);
    expect(legacyCombined.data).toHaveLength(39);
    for (const row of legacyCombined.data) {
      expect(row.id.startsWith("payment-paypg-")).toBe(true);
      expect(row.id).not.toBe("payment-paypg-beta");
      expect(row.id).not.toContain("boundary");
    }

    // --- STAFF: legacy filtered requests stay forbidden ---
    const staff = await staffHeaders();
    for (const query of [
      "from=2026-08-01",
      "to=2026-08-01",
      "from=2026-08-01&to=2026-08-15",
      "assignedUserId=staff-paypg-a",
      "from=2026-08-01&to=2026-08-15&assignedUserId=staff-paypg-a",
    ]) {
      const denied = await app.request(
        `/api/v1/payments?${query}`,
        {
          headers: staff,
        },
        env,
      );
      expect(denied.status).toBe(403);
      expect(
        (await denied.json<{ error: { code: string } }>()).error.code,
      ).toBe("AUTH_PERMISSION_DENIED");
    }

    // --- STAFF: legacy unfiltered list remains allowed in array shape ---
    const legacyStaff = await (
      await app.request("/api/v1/payments", { headers: staff }, env)
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyStaff.success).toBe(true);
    expect(Array.isArray(legacyStaff.data)).toBe(true);
    expect(legacyStaff.data).toHaveLength(44);

    // --- legacy organization isolation ---
    const legacyOther = await (
      await app.request(
        "/api/v1/payments",
        {
          headers: await otherHeaders(),
        },
        env,
      )
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyOther.success).toBe(true);
    expect(legacyOther.data.map((row) => row.id).sort()).toEqual([
      "payment-xother-1",
      "payment-xother-2",
    ]);
  });
});
