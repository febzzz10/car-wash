import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashSessionToken } from "../src/security/tokens";

const rawToken = "invoice-list-pagination-session";
const timestamp = "2026-07-23T11:00:00.000Z";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ListBody {
  readonly data: {
    readonly invoices: readonly { id: string }[];
    readonly pagination: {
      readonly hasNext: boolean;
      readonly limit: number;
      readonly nextCursor: string | null;
    };
  };
}

function invoiceInsert(
  id: string,
  organizationId: string,
  branchId: string,
  jobId: string,
  invoiceNumber: string,
  revision: number,
  name: string,
  phone: string,
  registration: string,
  createdAt: string,
  paymentStatus = "PAID",
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO invoices (
      id, organization_id, branch_id, wash_job_id, invoice_number,
      revision_number, invoice_status, business_name_snapshot,
      customer_name_snapshot, customer_phone_snapshot,
      vehicle_registration_snapshot, subtotal_minor, discount_minor,
      taxable_amount_minor, tax_minor, total_minor, paid_minor, balance_minor,
      currency_code, payment_status_snapshot, invoice_snapshot_json,
      issued_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'ISSUED', 'WashPro', ?, ?, ?, 10000, 0, 10000,
      0, 10000, ?, 0, 'INR', ?, '{}', ?, ?)`,
  ).bind(
    id,
    organizationId,
    branchId,
    jobId,
    invoiceNumber,
    revision,
    name,
    phone,
    registration,
    paymentStatus === "PAID" ? 10000 : 0,
    paymentStatus,
    createdAt,
    createdAt,
  );
}

function washJobInsert(
  id: string,
  organizationId: string,
  branchId: string,
  customerId: string,
  vehicleId: string,
  userId: string,
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
      'KL 05 PG 0001', 'Four Wheeler', 'COMPLETED', 'PAID', 10000, 0, 10000,
      0, 10000, 10000, 0, 0, ?, ?, ?)`,
  ).bind(
    id,
    organizationId,
    branchId,
    `WJ-${id}`,
    customerId,
    vehicleId,
    userId,
    userId,
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
  ];
  if (staffId !== null) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (
          id, organization_id, default_branch_id, full_name, username,
          username_normalized, password_hash, role, status, permissions_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'unused', 'STAFF', 'ACTIVE', '["invoices.generate"]', ?, ?)`,
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
    "invoice-list-pagination-other-session",
    env.SESSION_PEPPER,
  );
  const staffTokenHash = await hashSessionToken(
    "invoice-list-pagination-staff-session",
    env.SESSION_PEPPER,
  );
  const statements: ReturnType<typeof env.DB.prepare>[] = [
    ...orgSeeds(
      "org-invpg",
      "branch-invpg",
      "admin-invpg",
      "staff-invpg",
      tokenHash,
      staffTokenHash,
    ),
    ...orgSeeds(
      "org-invpg-other",
      "branch-invpg-other",
      "admin-invpg-other",
      null,
      otherTokenHash,
      null,
    ),
  ];
  for (let i = 1; i <= 36; i++) {
    statements.push(
      invoiceInsert(
        `invoice-invpg-${pad(i)}`,
        "org-invpg",
        "branch-invpg",
        "job-org-invpg",
        `INV-2026-${pad(i)}`,
        i - 1,
        "Pager Owner",
        "9180000001",
        `KL 05 PG ${pad(i)}`,
        `2026-01-01T00:${pad(i - 1)}:00.000Z`,
      ),
    );
  }
  for (let i = 1; i <= 3; i++) {
    statements.push(
      invoiceInsert(
        `invoice-invpg-tie-${i}`,
        "org-invpg",
        "branch-invpg",
        "job-org-invpg",
        `INV-TIE-${i}`,
        35 + i,
        "Pager Owner",
        "9180000001",
        `KL 05 PG 70${i}`,
        "2026-01-01T01:00:00.000Z",
      ),
    );
  }
  statements.push(
    invoiceInsert(
      "invoice-invpg-beta",
      "org-invpg",
      "branch-invpg",
      "job-org-invpg",
      "WP-2026-000016",
      39,
      "Rohit",
      "9180000002",
      "KL02XX3039",
      "2025-12-31T23:59:00.000Z",
    ),
    invoiceInsert(
      "invoice-invpg-phone",
      "org-invpg",
      "branch-invpg",
      "job-org-invpg",
      "PH-2026-000001",
      40,
      "Phone Owner",
      "9002005005",
      "KL 05 PH 0001",
      "2025-12-31T23:58:00.000Z",
      "UNPAID",
    ),
    invoiceInsert(
      "invoice-invpg-vehicle",
      "org-invpg",
      "branch-invpg",
      "job-org-invpg",
      "VH-2026-000001",
      41,
      "Vehicle Owner",
      "9180000003",
      "KL02GD2009",
      "2025-12-31T23:57:00.000Z",
    ),
    invoiceInsert(
      "invoice-xother-1",
      "org-invpg-other",
      "branch-invpg-other",
      "job-org-invpg-other",
      "XORG-2026-1",
      0,
      "Other Owner",
      "9111111111",
      "TN 01 XY 1000",
      "2025-01-01T00:00:00.000Z",
    ),
    invoiceInsert(
      "invoice-xother-2",
      "org-invpg-other",
      "branch-invpg-other",
      "job-org-invpg-other",
      "XORG-2026-2",
      1,
      "Other Owner",
      "9111111111",
      "TN 01 XY 2000",
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
    cookie: `__Host-washpro_session=invoice-list-pagination-other-session`,
  };
}

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=invoice-list-pagination-staff-session`,
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

describe("invoice list server-side pagination", () => {
  it("paginates, searches, scopes, masks, and validates", async () => {
    const headers = await adminHeaders();

    // --- legacy rollout-compatibility shape: no limit/cursor params ---
    const legacyRaw = await (
      await app.request("/api/v1/invoices", { headers }, env)
    ).json<{
      readonly data: readonly unknown[];
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(legacyRaw.success).toBe(true);
    expect(Array.isArray(legacyRaw.data)).toBe(true);
    expect(legacyRaw.data).toHaveLength(42);
    expect(legacyRaw.pagination).toBeUndefined();

    // --- legacy shape with the old empty-search request form ---
    const legacySearchRaw = await (
      await app.request("/api/v1/invoices?search=", { headers }, env)
    ).json<{
      readonly data: readonly unknown[];
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(legacySearchRaw.success).toBe(true);
    expect(Array.isArray(legacySearchRaw.data)).toBe(true);
    expect(legacySearchRaw.data).toHaveLength(42);
    expect(legacySearchRaw.pagination).toBeUndefined();

    // --- legacy search still searches the whole dataset ---
    const legacyNumberSearch = await (
      await app.request(
        "/api/v1/invoices?search=WP-2026-000016",
        { headers },
        env,
      )
    ).json<{
      readonly data: readonly { id: string }[];
      readonly success: boolean;
    }>();
    expect(legacyNumberSearch.success).toBe(true);
    expect(legacyNumberSearch.data).toHaveLength(1);
    expect(legacyNumberSearch.data[0]!.id).toBe("invoice-invpg-beta");

    // --- legacy organization isolation ---
    const legacyOther = await (
      await app.request(
        "/api/v1/invoices",
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
      "invoice-xother-1",
      "invoice-xother-2",
    ]);

    // --- legacy staff masking ---
    const legacyStaff = await (
      await app.request(
        "/api/v1/invoices",
        {
          headers: await staffHeaders(),
        },
        env,
      )
    ).json<{
      readonly data: readonly { customer_phone_snapshot: string }[];
      readonly success: boolean;
    }>();
    expect(legacyStaff.success).toBe(true);
    expect(legacyStaff.data.length).toBeGreaterThan(0);
    for (const invoice of legacyStaff.data) {
      expect([
        "91xxxxxx01",
        "91xxxxxx02",
        "91xxxxxx03",
        "90xxxxxx05",
      ]).toContain(invoice.customer_phone_snapshot);
    }
    expect(
      legacyStaff.data.every((invoice) =>
        invoice.customer_phone_snapshot.includes("x"),
      ),
    ).toBe(true);

    // --- nested wire envelope shape ---
    let page = await list("/api/v1/invoices?limit=15", headers);
    expect(page.status).toBe(200);
    const rawBody = await (
      await app.request("/api/v1/invoices?limit=15", { headers }, env)
    ).json<{
      readonly data: { readonly invoices: readonly unknown[] };
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(Array.isArray(rawBody.data.invoices)).toBe(true);
    expect(rawBody.pagination).toBeUndefined();
    expect(rawBody.success).toBe(true);
    expect(page.body.data.invoices).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);
    expect(page.body.data.pagination.hasNext).toBe(true);
    expect(page.body.data.pagination.nextCursor).toBeTruthy();
    expect(page.body.data.invoices[0]!.id).toBe("invoice-invpg-tie-3");
    expect(page.body.data.invoices[1]!.id).toBe("invoice-invpg-tie-2");
    expect(page.body.data.invoices[2]!.id).toBe("invoice-invpg-tie-1");
    expect(page.body.data.invoices[3]!.id).toBe("invoice-invpg-36");
    expect(page.body.data.invoices[14]!.id).toBe("invoice-invpg-25");

    // --- walk every page: no duplicates, no missing invoices ---
    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    let lastBody: ListBody = page.body;
    do {
      const url =
        cursor === null
          ? "/api/v1/invoices?limit=15"
          : `/api/v1/invoices?limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      expect(next.status).toBe(200);
      expect(next.body.data.invoices.length).toBeLessThanOrEqual(15);
      for (const row of next.body.data.invoices) {
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
    expect(seen.size).toBe(42);
    for (let i = 1; i <= 36; i++) {
      expect(seen.has(`invoice-invpg-${pad(i)}`)).toBe(true);
    }
    expect(seen.has("invoice-invpg-beta")).toBe(true);
    expect(seen.has("invoice-invpg-phone")).toBe(true);
    expect(seen.has("invoice-invpg-vehicle")).toBe(true);
    expect(lastBody.data.pagination.hasNext).toBe(false);
    expect(lastBody.data.pagination.nextCursor).toBeNull();
    expect(lastBody.data.invoices.map((row) => row.id)).toEqual([
      "invoice-invpg-09",
      "invoice-invpg-08",
      "invoice-invpg-07",
      "invoice-invpg-06",
      "invoice-invpg-05",
      "invoice-invpg-04",
      "invoice-invpg-03",
      "invoice-invpg-02",
      "invoice-invpg-01",
      "invoice-invpg-beta",
      "invoice-invpg-phone",
      "invoice-invpg-vehicle",
    ]);

    // --- explicit page sizes ---
    page = await list("/api/v1/invoices?limit=25", headers);
    expect(page.body.data.invoices).toHaveLength(25);
    expect(page.body.data.pagination.limit).toBe(25);
    expect(page.body.data.pagination.hasNext).toBe(true);
    page = await list("/api/v1/invoices?limit=50", headers);
    expect(page.body.data.invoices).toHaveLength(42);
    expect(page.body.data.pagination.limit).toBe(50);
    expect(page.body.data.pagination.hasNext).toBe(false);

    // --- excessive limits are clamped to 50 ---
    page = await list("/api/v1/invoices?limit=100000", headers);
    expect(page.body.data.invoices.length).toBeLessThanOrEqual(50);
    expect(page.body.data.pagination.limit).toBe(50);
    page = await list("/api/v1/invoices?limit=0", headers);
    expect(page.body.data.invoices).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);
    page = await list("/api/v1/invoices?limit=abc", headers);
    expect(page.body.data.invoices).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);

    // --- exact-boundary page ---
    page = await list("/api/v1/invoices?limit=20", headers);
    expect(page.body.data.invoices).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const boundaryCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/invoices?limit=20&cursor=${encodeURIComponent(boundaryCursor)}`,
      headers,
    );
    expect(page.body.data.invoices).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const finalCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/invoices?limit=20&cursor=${encodeURIComponent(finalCursor)}`,
      headers,
    );
    expect(page.body.data.invoices).toHaveLength(2);
    expect(page.body.data.pagination.hasNext).toBe(false);
    expect(page.body.data.pagination.nextCursor).toBeNull();

    // --- identical sort values straddle the page boundary ---
    const tieOrder: string[] = [];
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/invoices?limit=2"
          : `/api/v1/invoices?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      tieOrder.push(...next.body.data.invoices.map((row) => row.id));
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(30);
    } while (cursor !== null);
    expect(tieOrder.slice(0, 3)).toEqual([
      "invoice-invpg-tie-3",
      "invoice-invpg-tie-2",
      "invoice-invpg-tie-1",
    ]);
    expect(new Set(tieOrder).size).toBe(42);

    // --- search by invoice number reaches beyond the first page ---
    page = await list(
      "/api/v1/invoices?search=WP-2026-000016&limit=15",
      headers,
    );
    expect(page.body.data.invoices).toHaveLength(1);
    expect(page.body.data.invoices[0]!.id).toBe("invoice-invpg-beta");
    expect(page.body.data.invoices[0]).toMatchObject({
      invoice_number: "WP-2026-000016",
      customer_name_snapshot: "Rohit",
      vehicle_registration_snapshot: "KL02XX3039",
    });
    expect(page.body.data.pagination.hasNext).toBe(false);

    // --- search by phone ---
    page = await list("/api/v1/invoices?search=9002005005&limit=15", headers);
    expect(page.body.data.invoices).toHaveLength(1);
    expect(page.body.data.invoices[0]!.id).toBe("invoice-invpg-phone");

    // --- search by vehicle registration ---
    page = await list("/api/v1/invoices?search=KL02GD2009&limit=15", headers);
    expect(page.body.data.invoices).toHaveLength(1);
    expect(page.body.data.invoices[0]!.id).toBe("invoice-invpg-vehicle");

    // --- search results paginate across the whole database ---
    const searchSeen = new Set<string>();
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/invoices?search=INV&limit=15"
          : `/api/v1/invoices?search=INV&limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      for (const row of next.body.data.invoices) {
        expect(searchSeen.has(row.id)).toBe(false);
        searchSeen.add(row.id);
      }
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(searchSeen.size).toBe(39);
    for (let i = 1; i <= 36; i++) {
      expect(searchSeen.has(`invoice-invpg-${pad(i)}`)).toBe(true);
    }
    for (let i = 1; i <= 3; i++) {
      expect(searchSeen.has(`invoice-invpg-tie-${i}`)).toBe(true);
    }

    // --- organization isolation: cursors never cross tenants ---
    const other = await otherHeaders();
    page = await list("/api/v1/invoices?limit=15", other);
    expect(page.status).toBe(200);
    expect(page.body.data.invoices).toHaveLength(2);
    expect(page.body.data.invoices.map((row) => row.id).sort()).toEqual([
      "invoice-xother-1",
      "invoice-xother-2",
    ]);
    const invpgCursor = (await list("/api/v1/invoices?limit=15", headers)).body
      .data.pagination.nextCursor!;
    page = await list(
      `/api/v1/invoices?cursor=${encodeURIComponent(invpgCursor)}&limit=15`,
      other,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.invoices).toHaveLength(2);
    for (const row of page.body.data.invoices) {
      expect(row.id.startsWith("invoice-invpg-")).toBe(false);
      expect(row.id.startsWith("invoice-xother-")).toBe(true);
    }

    // --- invalid cursors are rejected cleanly ---
    for (const bad of [
      "/api/v1/invoices?cursor=not-valid-base64!!",
      `/api/v1/invoices?cursor=${encodeURIComponent(btoa("no-separator"))}`,
      `/api/v1/invoices?cursor=${encodeURIComponent(btoa("|id"))}`,
      `/api/v1/invoices?cursor=${encodeURIComponent(btoa("value|"))}`,
      `/api/v1/invoices?cursor=${"a".repeat(600)}`,
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
      `/api/v1/invoices?cursor=${encodeURIComponent(btoa("0000-00-00T00:00:00.000Z|zzz"))}`,
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.invoices).toHaveLength(0);
    expect(page.body.data.pagination.hasNext).toBe(false);
    expect(page.body.data.pagination.nextCursor).toBeNull();

    // --- empty search result returns the pagination envelope ---
    page = await list("/api/v1/invoices?search=ZZZZZZZZ&limit=15", headers);
    expect(page.status).toBe(200);
    expect(page.body.data.invoices).toHaveLength(0);
    expect(page.body.data.pagination).toEqual({
      hasNext: false,
      limit: 15,
      nextCursor: null,
    });

    // --- unauthenticated requests are rejected ---
    const anonymous = await app.request(
      "/api/v1/invoices",
      {
        headers: { origin: "https://washpro.test" },
      },
      env,
    );
    expect(anonymous.status).toBe(401);

    // --- staff retain list access with masked customer phones ---
    const staff = await staffHeaders();
    const staffPage = await list("/api/v1/invoices?limit=15", staff);
    expect(staffPage.status).toBe(200);
    expect(staffPage.body.data.invoices).toHaveLength(15);
    const staffRaw = await (
      await app.request("/api/v1/invoices?limit=15", { headers: staff }, env)
    ).json<{
      readonly data: {
        readonly invoices: readonly { customer_phone_snapshot: string }[];
      };
    }>();
    for (const invoice of staffRaw.data.invoices) {
      expect(invoice.customer_phone_snapshot).toBe("91xxxxxx01");
    }
  });
});
