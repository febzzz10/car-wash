import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashSessionToken } from "../src/security/tokens";

const rawToken = "customer-list-pagination-session";
const timestamp = "2026-07-23T11:00:00.000Z";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ListBody {
  readonly data: readonly { id: string }[];
  readonly pagination: {
    readonly hasNext: boolean;
    readonly limit: number;
    readonly nextCursor: string | null;
  };
}

function customerInsert(
  id: string,
  organizationId: string,
  fullName: string,
  phone: string,
  registeredAt: string,
  overrides?: Partial<{ status: string; lastVisitAt: string }>,
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO customers (
      id, organization_id, home_branch_id, full_name, name_search, phone,
      phone_normalized, status, registered_at, last_visit_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    organizationId,
    "branch-pgl",
    fullName,
    fullName.toLowerCase(),
    phone,
    `+${phone}`,
    overrides?.status ?? "ACTIVE",
    registeredAt,
    overrides?.lastVisitAt ?? null,
    registeredAt,
    registeredAt,
  );
}

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const staffTokenHash = await hashSessionToken(
    "customer-list-pagination-staff-session",
    env.SESSION_PEPPER,
  );
  const otherTokenHash = await hashSessionToken(
    "customer-list-pagination-other-session",
    env.SESSION_PEPPER,
  );
  const inserts: ReturnType<typeof env.DB.prepare>[] = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-pgl', 'PGL Org', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-pgl', 'org-pgl', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-pgl', 'org-pgl', 'branch-pgl', 'PGL Admin', 'admin-pgl',
        'admin-pgl', 'unused', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, permissions_json,
        created_at, updated_at
      ) VALUES ('staff-pgl', 'org-pgl', 'branch-pgl', 'PGL Staff', 'staff-pgl',
        'staff-pgl', 'unused', 'STAFF', 'ACTIVE', '["customers.read"]', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-pgl', 'org-pgl', 'admin-pgl', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-staff-pgl', 'org-pgl', 'staff-pgl', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(staffTokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('type-pgl', 'org-pgl', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
  ];
  for (let i = 1; i <= 36; i++) {
    inserts.push(
      customerInsert(
        `customer-pgl-${pad(i)}`,
        "org-pgl",
        `Alpha ${pad(i)}`,
        `91800000${pad(i)}`,
        `2026-01-01T00:${pad(i - 1)}:00.000Z`,
      ),
    );
  }
  for (let i = 1; i <= 3; i++) {
    inserts.push(
      customerInsert(
        `customer-pgl-tie-${i}`,
        "org-pgl",
        `Tie ${i}`,
        `916000000${i}`,
        "2026-01-01T01:00:00.000Z",
      ),
    );
  }
  inserts.push(
    customerInsert(
      "customer-pgl-beta",
      "org-pgl",
      "Beta Kumar",
      "9177777777",
      "2025-12-31T23:59:00.000Z",
    ),
  );
  for (let i = 1; i <= 3; i++) {
    inserts.push(
      customerInsert(
        `customer-pgl-inactive-${i}`,
        "org-pgl",
        `Inactive ${i}`,
        `915000000${i}`,
        "2026-01-01T01:10:00.000Z",
        { status: "INACTIVE" },
      ),
    );
  }
  inserts.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (
        id, organization_id, customer_id, vehicle_type_id, registration_number,
        registration_normalized, created_at, updated_at
      ) VALUES ('vehicle-pgl-02', 'org-pgl', 'customer-pgl-02', 'type-pgl',
        'KL 05 PG 0002', 'KL05PG0002', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-pgl-other', 'Other PGL', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-pgl-other', 'org-pgl-other', NULL, 'Other Admin', 'other-admin',
        'other-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-pgl-other', 'org-pgl-other', 'admin-pgl-other', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(otherTokenHash, timestamp, timestamp),
    customerInsert(
      "customer-other-1",
      "org-pgl-other",
      "Other One",
      "9111111111",
      "2025-01-01T00:00:00.000Z",
    ),
    customerInsert(
      "customer-other-2",
      "org-pgl-other",
      "Other Two",
      "9222222222",
      "2025-01-01T00:01:00.000Z",
    ),
  );
  await env.DB.batch(inserts);
});

async function adminHeaders(): Promise<Record<string, string>> {
  return { cookie: `__Host-washpro_session=${rawToken}` };
}

async function otherHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=customer-list-pagination-other-session`,
  };
}

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=customer-list-pagination-staff-session`,
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

describe("customer list server-side pagination", () => {
  it("paginates, filters, searches, scopes, and validates", async () => {
    const headers = await adminHeaders();

    // --- default limit: 15 ---
    let page = await list("/api/v1/customers", headers);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(15);
    expect(page.body.pagination.limit).toBe(15);
    expect(page.body.pagination.hasNext).toBe(true);
    expect(page.body.pagination.nextCursor).toBeTruthy();
    expect(page.body.data[0]!.id).toBe("customer-pgl-tie-3");
    expect(page.body.data[1]!.id).toBe("customer-pgl-tie-2");
    expect(page.body.data[2]!.id).toBe("customer-pgl-tie-1");
    expect(page.body.data[3]!.id).toBe("customer-pgl-36");
    expect(page.body.data[14]!.id).toBe("customer-pgl-25");

    // --- walk every page: no duplicates, no missing customers ---
    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    let lastBody: ListBody = page.body;
    do {
      const url =
        cursor === null
          ? "/api/v1/customers?limit=15"
          : `/api/v1/customers?limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      expect(next.status).toBe(200);
      expect(next.body.data.length).toBeLessThanOrEqual(15);
      for (const row of next.body.data) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      lastBody = next.body;
      cursor = next.body.pagination.hasNext
        ? next.body.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(seen.size).toBe(40);
    for (let i = 1; i <= 36; i++) {
      expect(seen.has(`customer-pgl-${pad(i)}`)).toBe(true);
    }
    for (let i = 1; i <= 3; i++) {
      expect(seen.has(`customer-pgl-tie-${i}`)).toBe(true);
    }
    expect(seen.has("customer-pgl-beta")).toBe(true);
    expect(lastBody.pagination.hasNext).toBe(false);
    expect(lastBody.pagination.nextCursor).toBeNull();
    expect(lastBody.data.map((row) => row.id)).toEqual([
      "customer-pgl-09",
      "customer-pgl-08",
      "customer-pgl-07",
      "customer-pgl-06",
      "customer-pgl-05",
      "customer-pgl-04",
      "customer-pgl-03",
      "customer-pgl-02",
      "customer-pgl-01",
      "customer-pgl-beta",
    ]);

    // --- explicit page sizes ---
    page = await list("/api/v1/customers?limit=25", headers);
    expect(page.body.data).toHaveLength(25);
    expect(page.body.pagination.limit).toBe(25);
    expect(page.body.pagination.hasNext).toBe(true);
    page = await list("/api/v1/customers?limit=50", headers);
    expect(page.body.data).toHaveLength(40);
    expect(page.body.pagination.limit).toBe(50);
    expect(page.body.pagination.hasNext).toBe(false);

    // --- excessive limits are clamped to 50 ---
    page = await list("/api/v1/customers?limit=100000", headers);
    expect(page.body.data.length).toBeLessThanOrEqual(50);
    expect(page.body.pagination.limit).toBe(50);
    page = await list("/api/v1/customers?limit=0", headers);
    expect(page.body.data).toHaveLength(15);
    expect(page.body.pagination.limit).toBe(15);
    page = await list("/api/v1/customers?limit=abc", headers);
    expect(page.body.data).toHaveLength(15);
    expect(page.body.pagination.limit).toBe(15);

    // --- exact-boundary page ---
    page = await list("/api/v1/customers?limit=20", headers);
    expect(page.body.data).toHaveLength(20);
    expect(page.body.pagination.hasNext).toBe(true);
    const boundaryCursor = page.body.pagination.nextCursor!;
    page = await list(
      `/api/v1/customers?limit=20&cursor=${encodeURIComponent(boundaryCursor)}`,
      headers,
    );
    expect(page.body.data).toHaveLength(20);
    expect(page.body.pagination.hasNext).toBe(false);
    expect(page.body.pagination.nextCursor).toBeNull();

    // --- identical sort values straddle the page boundary ---
    const tieOrder: string[] = [];
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/customers?limit=2"
          : `/api/v1/customers?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      tieOrder.push(...next.body.data.map((row) => row.id));
      cursor = next.body.pagination.hasNext
        ? next.body.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(30);
    } while (cursor !== null);
    expect(tieOrder.slice(0, 3)).toEqual([
      "customer-pgl-tie-3",
      "customer-pgl-tie-2",
      "customer-pgl-tie-1",
    ]);
    expect(new Set(tieOrder).size).toBe(40);

    // --- last_visit_at overrides registered_at in the sort key ---
    await env.DB.prepare(
      "UPDATE customers SET last_visit_at = ? WHERE id = ?",
    )
      .bind("2027-01-01T00:00:00.000Z", "customer-pgl-beta")
      .run();
    page = await list("/api/v1/customers?limit=15", headers);
    expect(page.body.data[0]!.id).toBe("customer-pgl-beta");

    // --- active filter ---
    page = await list("/api/v1/customers?status=ACTIVE&limit=15", headers);
    expect(page.body.data).toHaveLength(15);
    for (const row of page.body.data) {
      expect(row.id.startsWith("customer-pgl-inactive-")).toBe(false);
    }

    // --- inactive filter ---
    page = await list("/api/v1/customers?status=INACTIVE", headers);
    expect(page.body.data).toHaveLength(3);
    expect(page.body.pagination.hasNext).toBe(false);
    expect(page.body.data.map((row) => row.id)).toEqual([
      "customer-pgl-inactive-3",
      "customer-pgl-inactive-2",
      "customer-pgl-inactive-1",
    ]);

    // --- name search reaches customers beyond the first page ---
    page = await list("/api/v1/customers?search=Beta", headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0]!.id).toBe("customer-pgl-beta");
    expect(page.body.pagination.hasNext).toBe(false);

    // --- phone search reaches customers beyond the first page ---
    page = await list("/api/v1/customers?search=9180000002", headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0]!.id).toBe("customer-pgl-02");

    // --- registration search reaches customers beyond the first page ---
    page = await list("/api/v1/customers?search=KL05PG0002", headers);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0]).toMatchObject({
      id: "customer-pgl-02",
      matching_registrations: ["KL 05 PG 0002"],
    });

    // --- search results paginate across the whole database ---
    const searchSeen = new Set<string>();
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/customers?search=Alpha&limit=15"
          : `/api/v1/customers?search=Alpha&limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      for (const row of next.body.data) {
        expect(searchSeen.has(row.id)).toBe(false);
        searchSeen.add(row.id);
      }
      cursor = next.body.pagination.hasNext
        ? next.body.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(searchSeen.size).toBe(36);
    for (let i = 1; i <= 36; i++) {
      expect(searchSeen.has(`customer-pgl-${pad(i)}`)).toBe(true);
    }

    // --- organization isolation: cursors never cross tenants ---
    const other = await otherHeaders();
    page = await list("/api/v1/customers", other);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.data.map((row) => row.id).sort()).toEqual([
      "customer-other-1",
      "customer-other-2",
    ]);
    const pglCursor = (
      await list("/api/v1/customers?limit=15", headers)
    ).body.pagination.nextCursor!;
    page = await list(
      `/api/v1/customers?cursor=${encodeURIComponent(pglCursor)}&limit=15`,
      other,
    );
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    for (const row of page.body.data) {
      expect(row.id.startsWith("customer-pgl-")).toBe(false);
      expect(row.id.startsWith("customer-other-")).toBe(true);
    }

    // --- invalid cursors are rejected cleanly ---
    for (const bad of [
      "/api/v1/customers?cursor=not-valid-base64!!",
      `/api/v1/customers?cursor=${encodeURIComponent(btoa("no-separator"))}`,
      `/api/v1/customers?cursor=${encodeURIComponent(btoa("|id"))}`,
      `/api/v1/customers?cursor=${encodeURIComponent(btoa("value|"))}`,
      `/api/v1/customers?cursor=${"a".repeat(600)}`,
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
      `/api/v1/customers?cursor=${encodeURIComponent(btoa("0000-00-00T00:00:00.000Z|zzz"))}`,
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(0);
    expect(page.body.pagination.hasNext).toBe(false);

    // --- unauthenticated requests are rejected ---
    const anonymous = await app.request("/api/v1/customers", {
      headers: { origin: "https://washpro.test" },
    }, env);
    expect(anonymous.status).toBe(401);

    // --- staff retain list access ---
    const staff = await staffHeaders();
    const staffPage = await list("/api/v1/customers?limit=15", staff);
    expect(staffPage.status).toBe(200);
    expect(staffPage.body.data).toHaveLength(15);
  });
});