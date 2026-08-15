import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashSessionToken } from "../src/security/tokens";

const rawToken = "vehicle-list-pagination-session";
const timestamp = "2026-07-23T11:00:00.000Z";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface ListBody {
  readonly data: {
    readonly vehicles: readonly { id: string }[];
    readonly pagination: {
      readonly hasNext: boolean;
      readonly limit: number;
      readonly nextCursor: string | null;
    };
  };
}

function vehicleInsert(
  id: string,
  organizationId: string,
  customerId: string,
  vehicleTypeId: string,
  registrationNumber: string,
  createdAt: string,
  overrides?: Partial<{ lastWashAt: string; status: string }>,
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO vehicles (
      id, organization_id, customer_id, vehicle_type_id, registration_number,
      registration_normalized, status, last_wash_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    organizationId,
    customerId,
    vehicleTypeId,
    registrationNumber,
    registrationNumber.replace(/\s/gu, "").toUpperCase(),
    overrides?.status ?? "ACTIVE",
    overrides?.lastWashAt ?? null,
    createdAt,
    createdAt,
  );
}

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const staffTokenHash = await hashSessionToken(
    "vehicle-list-pagination-staff-session",
    env.SESSION_PEPPER,
  );
  const otherTokenHash = await hashSessionToken(
    "vehicle-list-pagination-other-session",
    env.SESSION_PEPPER,
  );
  const inserts: ReturnType<typeof env.DB.prepare>[] = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-vpg', 'VPG Org', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-vpg', 'org-vpg', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-vpg', 'org-vpg', 'branch-vpg', 'VPG Admin', 'admin-vpg',
        'admin-vpg', 'unused', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, permissions_json,
        created_at, updated_at
      ) VALUES ('staff-vpg', 'org-vpg', 'branch-vpg', 'VPG Staff', 'staff-vpg',
        'staff-vpg', 'unused', 'STAFF', 'ACTIVE', '["vehicles.read"]', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-vpg', 'org-vpg', 'admin-vpg', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-staff-vpg', 'org-vpg', 'staff-vpg', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(staffTokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('type-vpg', 'org-vpg', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (
        id, organization_id, home_branch_id, full_name, name_search, phone,
        phone_normalized, status, registered_at, created_at, updated_at
      ) VALUES ('customer-vpg-1', 'org-vpg', 'branch-vpg', 'VPG Owner',
        'vpg owner', '9180000001', '+9180000001', 'ACTIVE', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
  ];
  for (let i = 1; i <= 36; i++) {
    inserts.push(
      vehicleInsert(
        `vehicle-vpg-${pad(i)}`,
        "org-vpg",
        "customer-vpg-1",
        "type-vpg",
        `KL 05 VG ${pad(i)}`,
        `2026-01-01T00:${pad(i - 1)}:00.000Z`,
      ),
    );
  }
  for (let i = 1; i <= 3; i++) {
    inserts.push(
      vehicleInsert(
        `vehicle-vpg-tie-${i}`,
        "org-vpg",
        "customer-vpg-1",
        "type-vpg",
        `KL 05 VG 70${i}`,
        "2026-01-01T01:00:00.000Z",
      ),
    );
  }
  inserts.push(
    vehicleInsert(
      "vehicle-vpg-beta",
      "org-vpg",
      "customer-vpg-1",
      "type-vpg",
      "KL 05 VG 8000",
      "2025-12-31T23:59:00.000Z",
    ),
    vehicleInsert(
      "vehicle-vpg-inactive",
      "org-vpg",
      "customer-vpg-1",
      "type-vpg",
      "KL 05 VG 9000",
      "2026-01-01T01:20:00.000Z",
      { status: "INACTIVE" },
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-vpg-other', 'Other VPG', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('type-vpg-other', 'org-vpg-other', 'TWO_WHEELER', 'Two Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (
        id, organization_id, home_branch_id, full_name, name_search, phone,
        phone_normalized, status, registered_at, created_at, updated_at
      ) VALUES ('customer-vpg-other', 'org-vpg-other', NULL, 'Other Owner',
        'other owner', '9111111111', '+9111111111', 'ACTIVE', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-vpg-other', 'org-vpg-other', NULL, 'Other Admin', 'other-admin',
        'other-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-vpg-other', 'org-vpg-other', 'admin-vpg-other', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(otherTokenHash, timestamp, timestamp),
    vehicleInsert(
      "vehicle-xother-1",
      "org-vpg-other",
      "customer-vpg-other",
      "type-vpg-other",
      "TN 01 XY 1000",
      "2025-01-01T00:00:00.000Z",
    ),
    vehicleInsert(
      "vehicle-xother-2",
      "org-vpg-other",
      "customer-vpg-other",
      "type-vpg-other",
      "TN 01 XY 2000",
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
    cookie: `__Host-washpro_session=vehicle-list-pagination-other-session`,
  };
}

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=vehicle-list-pagination-staff-session`,
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

describe("vehicle list server-side pagination", () => {
  it("paginates, searches, scopes, masks, and validates", async () => {
    const headers = await adminHeaders();

    // --- legacy shape: no limit/cursor params (pre-rollout web client) ---
    const legacyBody = await (
      await app.request("/api/v1/vehicles", { headers }, env)
    ).json<{
      readonly data: readonly unknown[];
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(legacyBody.success).toBe(true);
    expect(Array.isArray(legacyBody.data)).toBe(true);
    expect(legacyBody.data).toHaveLength(41);
    expect(legacyBody.pagination).toBeUndefined();

    // --- default limit: 15 ---
    let page = await list("/api/v1/vehicles?limit=15", headers);
    expect(page.status).toBe(200);
    const rawBody = await (
      await app.request("/api/v1/vehicles?limit=15", { headers }, env)
    ).json<{
      readonly data: { readonly vehicles: readonly unknown[] };
      readonly pagination?: unknown;
      readonly success: boolean;
    }>();
    expect(Array.isArray(rawBody.data.vehicles)).toBe(true);
    expect(rawBody.pagination).toBeUndefined();
    expect(rawBody.success).toBe(true);
    expect(page.body.data.vehicles).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);
    expect(page.body.data.pagination.hasNext).toBe(true);
    expect(page.body.data.pagination.nextCursor).toBeTruthy();
    expect(page.body.data.vehicles[0]!.id).toBe("vehicle-vpg-inactive");
    expect(page.body.data.vehicles[1]!.id).toBe("vehicle-vpg-tie-3");
    expect(page.body.data.vehicles[2]!.id).toBe("vehicle-vpg-tie-2");
    expect(page.body.data.vehicles[3]!.id).toBe("vehicle-vpg-tie-1");
    expect(page.body.data.vehicles[4]!.id).toBe("vehicle-vpg-36");
    expect(page.body.data.vehicles[14]!.id).toBe("vehicle-vpg-26");
    expect(page.body.data.vehicles[0]).toMatchObject({
      registration_number: "KL 05 VG 9000",
      vehicle_type_name: "Four Wheeler",
      customer_name: "VPG Owner",
      customer_phone: "9180000001",
      status: "INACTIVE",
    });

    // --- walk every page: no duplicates, no missing vehicles ---
    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    let lastBody: ListBody = page.body;
    do {
      const url =
        cursor === null
          ? "/api/v1/vehicles?limit=15"
          : `/api/v1/vehicles?limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      expect(next.status).toBe(200);
      expect(next.body.data.vehicles.length).toBeLessThanOrEqual(15);
      for (const row of next.body.data.vehicles) {
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
    expect(seen.size).toBe(41);
    for (let i = 1; i <= 36; i++) {
      expect(seen.has(`vehicle-vpg-${pad(i)}`)).toBe(true);
    }
    for (let i = 1; i <= 3; i++) {
      expect(seen.has(`vehicle-vpg-tie-${i}`)).toBe(true);
    }
    expect(seen.has("vehicle-vpg-beta")).toBe(true);
    expect(seen.has("vehicle-vpg-inactive")).toBe(true);
    expect(lastBody.data.pagination.hasNext).toBe(false);
    expect(lastBody.data.pagination.nextCursor).toBeNull();
    expect(lastBody.data.vehicles.map((row) => row.id)).toEqual([
      "vehicle-vpg-10",
      "vehicle-vpg-09",
      "vehicle-vpg-08",
      "vehicle-vpg-07",
      "vehicle-vpg-06",
      "vehicle-vpg-05",
      "vehicle-vpg-04",
      "vehicle-vpg-03",
      "vehicle-vpg-02",
      "vehicle-vpg-01",
      "vehicle-vpg-beta",
    ]);

    // --- explicit page sizes ---
    page = await list("/api/v1/vehicles?limit=25", headers);
    expect(page.body.data.vehicles).toHaveLength(25);
    expect(page.body.data.pagination.limit).toBe(25);
    expect(page.body.data.pagination.hasNext).toBe(true);
    page = await list("/api/v1/vehicles?limit=50", headers);
    expect(page.body.data.vehicles).toHaveLength(41);
    expect(page.body.data.pagination.limit).toBe(50);
    expect(page.body.data.pagination.hasNext).toBe(false);

    // --- excessive limits are clamped to 50 ---
    page = await list("/api/v1/vehicles?limit=100000", headers);
    expect(page.body.data.vehicles.length).toBeLessThanOrEqual(50);
    expect(page.body.data.pagination.limit).toBe(50);
    page = await list("/api/v1/vehicles?limit=0", headers);
    expect(page.body.data.vehicles).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);
    page = await list("/api/v1/vehicles?limit=abc", headers);
    expect(page.body.data.vehicles).toHaveLength(15);
    expect(page.body.data.pagination.limit).toBe(15);

    // --- exact-boundary page ---
    page = await list("/api/v1/vehicles?limit=20", headers);
    expect(page.body.data.vehicles).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const boundaryCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/vehicles?limit=20&cursor=${encodeURIComponent(boundaryCursor)}`,
      headers,
    );
    expect(page.body.data.vehicles).toHaveLength(20);
    expect(page.body.data.pagination.hasNext).toBe(true);
    const finalCursor = page.body.data.pagination.nextCursor!;
    page = await list(
      `/api/v1/vehicles?limit=20&cursor=${encodeURIComponent(finalCursor)}`,
      headers,
    );
    expect(page.body.data.vehicles).toHaveLength(1);
    expect(page.body.data.vehicles[0]!.id).toBe("vehicle-vpg-beta");
    expect(page.body.data.pagination.hasNext).toBe(false);
    expect(page.body.data.pagination.nextCursor).toBeNull();

    // --- identical sort values straddle the page boundary ---
    const tieOrder: string[] = [];
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/vehicles?limit=2"
          : `/api/v1/vehicles?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      tieOrder.push(...next.body.data.vehicles.map((row) => row.id));
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(30);
    } while (cursor !== null);
    expect(tieOrder.slice(0, 4)).toEqual([
      "vehicle-vpg-inactive",
      "vehicle-vpg-tie-3",
      "vehicle-vpg-tie-2",
      "vehicle-vpg-tie-1",
    ]);
    expect(new Set(tieOrder).size).toBe(41);

    // --- last_wash_at overrides created_at in the sort key ---
    await env.DB.prepare("UPDATE vehicles SET last_wash_at = ? WHERE id = ?")
      .bind("2027-01-01T00:00:00.000Z", "vehicle-vpg-beta")
      .run();
    page = await list("/api/v1/vehicles?limit=15", headers);
    expect(page.body.data.vehicles[0]!.id).toBe("vehicle-vpg-beta");

    // --- registration search reaches vehicles beyond the first page ---
    page = await list("/api/v1/vehicles?search=KL05VG02&limit=15", headers);
    expect(page.body.data.vehicles).toHaveLength(1);
    expect(page.body.data.vehicles[0]!.id).toBe("vehicle-vpg-02");
    expect(page.body.data.pagination.hasNext).toBe(false);
    page = await list(
      "/api/v1/vehicles?search=kl%2005%20vg%2002&limit=15",
      headers,
    );
    expect(page.body.data.vehicles).toHaveLength(1);
    expect(page.body.data.vehicles[0]!.id).toBe("vehicle-vpg-02");

    // --- search results paginate across the whole database ---
    const searchSeen = new Set<string>();
    cursor = null;
    guard = 0;
    do {
      const url =
        cursor === null
          ? "/api/v1/vehicles?search=VG&limit=15"
          : `/api/v1/vehicles?search=VG&limit=15&cursor=${encodeURIComponent(cursor)}`;
      const next = await list(url, headers);
      for (const row of next.body.data.vehicles) {
        expect(searchSeen.has(row.id)).toBe(false);
        searchSeen.add(row.id);
      }
      cursor = next.body.data.pagination.hasNext
        ? next.body.data.pagination.nextCursor
        : null;
      guard++;
      expect(guard).toBeLessThan(10);
    } while (cursor !== null);
    expect(searchSeen.size).toBe(41);
    for (let i = 1; i <= 36; i++) {
      expect(searchSeen.has(`vehicle-vpg-${pad(i)}`)).toBe(true);
    }

    // --- organization isolation: cursors never cross tenants ---
    const other = await otherHeaders();
    page = await list("/api/v1/vehicles?limit=15", other);
    expect(page.status).toBe(200);
    expect(page.body.data.vehicles).toHaveLength(2);
    expect(page.body.data.vehicles.map((row) => row.id).sort()).toEqual([
      "vehicle-xother-1",
      "vehicle-xother-2",
    ]);
    const foreignCursorPage = await (
      await app.request("/api/v1/vehicles?limit=15", { headers: other }, env)
    ).json<{
      readonly data: {
        readonly vehicles: readonly { organization_id: string }[];
      };
    }>();
    for (const vehicle of foreignCursorPage.data.vehicles) {
      expect(vehicle.organization_id).toBe("org-vpg-other");
    }
    const vpgCursor = (await list("/api/v1/vehicles?limit=15", headers)).body
      .data.pagination.nextCursor!;
    page = await list(
      `/api/v1/vehicles?cursor=${encodeURIComponent(vpgCursor)}&limit=15`,
      other,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.vehicles).toHaveLength(2);
    for (const row of page.body.data.vehicles) {
      expect(row.id.startsWith("vehicle-vpg-")).toBe(false);
      expect(row.id.startsWith("vehicle-xother-")).toBe(true);
    }
    const cursorLeakPage = await (
      await app.request(
        `/api/v1/vehicles?cursor=${encodeURIComponent(vpgCursor)}&limit=15`,
        { headers: other },
        env,
      )
    ).json<{
      readonly data: {
        readonly vehicles: readonly { id: string; organization_id: string }[];
      };
    }>();
    for (const vehicle of cursorLeakPage.data.vehicles) {
      expect(vehicle.organization_id).toBe("org-vpg-other");
      expect(vehicle.id.startsWith("vehicle-vpg-")).toBe(false);
    }

    // --- invalid cursors are rejected cleanly ---
    for (const bad of [
      "/api/v1/vehicles?cursor=not-valid-base64!!",
      `/api/v1/vehicles?cursor=${encodeURIComponent(btoa("no-separator"))}`,
      `/api/v1/vehicles?cursor=${encodeURIComponent(btoa("|id"))}`,
      `/api/v1/vehicles?cursor=${encodeURIComponent(btoa("value|"))}`,
      `/api/v1/vehicles?cursor=${"a".repeat(600)}`,
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
      `/api/v1/vehicles?cursor=${encodeURIComponent(btoa("0000-00-00T00:00:00.000Z|zzz"))}`,
      headers,
    );
    expect(page.status).toBe(200);
    expect(page.body.data.vehicles).toHaveLength(0);
    expect(page.body.data.pagination.hasNext).toBe(false);

    // --- unauthenticated requests are rejected ---
    const anonymous = await app.request(
      "/api/v1/vehicles",
      {
        headers: { origin: "https://washpro.test" },
      },
      env,
    );
    expect(anonymous.status).toBe(401);

    // --- staff retain list access with masked owner phones ---
    const staff = await staffHeaders();
    const staffPage = await list("/api/v1/vehicles?limit=15", staff);
    expect(staffPage.status).toBe(200);
    expect(staffPage.body.data.vehicles).toHaveLength(15);
    const staffRaw = await (
      await app.request("/api/v1/vehicles?limit=15", { headers: staff }, env)
    ).json<{
      readonly data: {
        readonly vehicles: readonly { customer_phone: string }[];
      };
    }>();
    for (const vehicle of staffRaw.data.vehicles) {
      expect(vehicle.customer_phone).toBe("91xxxxxx01");
    }
    const staffLegacyRaw = await (
      await app.request("/api/v1/vehicles", { headers: staff }, env)
    ).json<{
      readonly data: readonly { customer_phone: string }[];
    }>();
    for (const vehicle of staffLegacyRaw.data) {
      expect(vehicle.customer_phone).toBe("91xxxxxx01");
    }
  });
});
