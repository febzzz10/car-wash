import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "ch-pagination-test-session";
const timestamp = "2026-07-23T12:00:00.000Z";

async function hashToken(): Promise<string> {
  return await hashSessionToken(rawToken, env.SESSION_PEPPER);
}

beforeEach(async () => {
  const tokenHash = await hashToken();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-ch', 'CH Org', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, latitude, longitude, allowed_radius_meters, minimum_gps_accuracy_meters, created_at, updated_at) VALUES ('branch-ch', 'org-ch', 'MAIN', 'Main', 10, 76, 150, 50, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-ch', 'org-ch', 'branch-ch', 'CH Admin', 'ch-admin', 'ch-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-ch', 'org-ch', 'admin-ch', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('customer-ch', 'org-ch', 'branch-ch', 'CH Customer', 'ch customer', '9876543000', '+919876543000', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('other-customer-ch', 'org-ch', 'branch-ch', 'Other Customer', 'other customer', '9876543111', '+919876543111', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('type-ch', 'org-ch', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-ch', 'org-ch', 'customer-ch', 'type-ch', 'KL 01 CH 0001', 'KL01CH0001', 'Toyota', 'Camry', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-other-ch', 'org-ch', 'other-customer-ch', 'type-ch', 'KL 01 CH 0002', 'KL01CH0002', 'Honda', 'City', ?, ?)",
    ).bind(timestamp, timestamp),
  ]);
});

async function requestHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

function insertJob(
  id: string,
  status: string,
  createdAt: string,
  overrides?: Partial<{ customerId: string; vehicleId: string }>,
): ReturnType<typeof env.DB.prepare> {
  const customerId = overrides?.customerId ?? "customer-ch";
  const vehicleId = overrides?.vehicleId ?? "vehicle-ch";
  const nameSnapshot = customerId === "other-customer-ch" ? "Other Customer" : "CH Customer";
  const phoneSnapshot = customerId === "other-customer-ch" ? "9876543111" : "9876543000";
  const regSnapshot = vehicleId === "vehicle-other-ch" ? "KL 01 CH 0002" : "KL 01 CH 0001";
  return env.DB.prepare(
    `INSERT OR IGNORE INTO wash_jobs
     (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, version, created_by_user_id, created_at, updated_at)
     VALUES (?, 'org-ch', 'branch-ch', ?, ?, ?, 'admin-ch', ?, ?, ?, 'Four Wheeler', ?, 1, 'admin-ch', ?, ?)`,
  ).bind(id, `WJ-TEST-${id}`, customerId, vehicleId, nameSnapshot, phoneSnapshot, regSnapshot, status, createdAt, createdAt);
}

describe("customer history pagination", () => {
  it("paginates, scopes, and validates", async () => {
    // --- empty ---
    const headers = await requestHeaders();
    let res = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=20",
      { headers },
      env,
    );
    expect(res.status).toBe(200);
    let body = await res.json<{
      data: { jobs: unknown[]; hasMore: boolean; nextCursor: string | null };
    }>();
    expect(body.data.jobs).toHaveLength(0);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();

    // --- fewer than limit ---
    await env.DB.batch([
      insertJob("job-ch-01", "COMPLETED", "2026-07-23T12:01:00.000Z"),
      insertJob("job-ch-02", "COMPLETED", "2026-07-23T12:02:00.000Z"),
    ]);
    res = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=20",
      { headers },
      env,
    );
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.data.jobs).toHaveLength(2);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();

    // --- paginate 25 jobs with limit=10 ---
    const inserts: ReturnType<typeof env.DB.prepare>[] = [];
    for (let i = 3; i <= 27; i++) {
      const min = String(i).padStart(2, "0");
      inserts.push(
        insertJob(`job-ch-pg-${min}`, "COMPLETED", `2026-07-23T12:${min}:00.000Z`),
      );
    }
    await env.DB.batch(inserts);

    const page1 = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=10",
      { headers },
      env,
    );
    expect(page1.status).toBe(200);
    const body1 = await page1.json<{
      data: { jobs: { id: string }[]; hasMore: boolean; nextCursor: string };
    }>();
    expect(body1.data.jobs).toHaveLength(10);
    expect(body1.data.hasMore).toBe(true);
    expect(body1.data.nextCursor).toBeTruthy();
    expect(body1.data.jobs[0]!.id).toBe("job-ch-pg-27");
    expect(body1.data.jobs[9]!.id).toBe("job-ch-pg-18");

    const page2 = await app.request(
      `/api/v1/customers/customer-ch/wash-jobs?cursor=${encodeURIComponent(body1.data.nextCursor)}&limit=10`,
      { headers },
      env,
    );
    expect(page2.status).toBe(200);
    const body2 = await page2.json<{
      data: { jobs: { id: string }[]; hasMore: boolean; nextCursor: string | null };
    }>();
    expect(body2.data.jobs).toHaveLength(10);
    expect(body2.data.hasMore).toBe(true);
    expect(body2.data.jobs[0]!.id).toBe("job-ch-pg-17");
    expect(body2.data.jobs[9]!.id).toBe("job-ch-pg-08");

    const page3 = await app.request(
      `/api/v1/customers/customer-ch/wash-jobs?cursor=${encodeURIComponent(body2.data.nextCursor!)}&limit=10`,
      { headers },
      env,
    );
    expect(page3.status).toBe(200);
    const body3 = await page3.json<{
      data: { jobs: { id: string }[]; hasMore: boolean; nextCursor: string | null };
    }>();
    expect(body3.data.jobs).toHaveLength(7);
    expect(body3.data.hasMore).toBe(false);
    expect(body3.data.nextCursor).toBeNull();
    expect(body3.data.jobs[0]!.id).toBe("job-ch-pg-07");
    expect(body3.data.jobs[6]!.id).toBe("job-ch-01");

    // --- equal timestamps ---
    await env.DB.batch([
      insertJob("job-ch-tie-a", "COMPLETED", "2026-07-23T12:30:00.000Z"),
      insertJob("job-ch-tie-b", "COMPLETED", "2026-07-23T12:30:00.000Z"),
      insertJob("job-ch-tie-c", "COMPLETED", "2026-07-23T12:30:00.000Z"),
    ]);
    const tieRes = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=20",
      { headers },
      env,
    );
    expect(tieRes.status).toBe(200);
    const tieBody = await tieRes.json<{
      data: { jobs: { id: string }[] };
    }>();
    const tieJobs = tieBody.data.jobs!.filter(
      (j: { id: string }) => j.id.startsWith("job-ch-tie-"),
    );
    expect(tieJobs).toHaveLength(3);
    expect(tieJobs[0]!.id).toBe("job-ch-tie-c");
    expect(tieJobs[1]!.id).toBe("job-ch-tie-b");
    expect(tieJobs[2]!.id).toBe("job-ch-tie-a");

    // --- scope: other customer's job not returned ---
    await env.DB.batch([
      insertJob("job-ch-other-scope", "COMPLETED", "2026-07-23T12:40:00.000Z", {
        customerId: "other-customer-ch",
        vehicleId: "vehicle-other-ch",
      }),
    ]);
    const scopeRes = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=20",
      { headers },
      env,
    );
    expect(scopeRes.status).toBe(200);
    const scopeBody = await scopeRes.json<{
      data: { jobs: { id: string }[] };
    }>();
    expect(
      scopeBody.data.jobs.some((j: { id: string }) => j.id === "job-ch-other-scope"),
    ).toBe(false);

    // --- limit cap at 100 ---
    const capInserts: ReturnType<typeof env.DB.prepare>[] = [];
    for (let i = 1; i <= 150; i++) {
      capInserts.push(
        insertJob(
          `job-ch-cap-${String(i).padStart(3, "0")}`,
          "COMPLETED",
          `2026-07-23T13:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
        ),
      );
    }
    await env.DB.batch(capInserts);
    const capRes = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?limit=999",
      { headers },
      env,
    );
    expect(capRes.status).toBe(200);
    const capBody = await capRes.json<{
      data: { jobs: unknown[]; hasMore: boolean; nextCursor: string | null };
    }>();
    expect(capBody.data.jobs.length).toBeLessThanOrEqual(100);
    if (capBody.data.jobs.length === 100) {
      expect(capBody.data.hasMore).toBe(true);
    }

    // --- invalid cursor ---
    const invalidRes = await app.request(
      "/api/v1/customers/customer-ch/wash-jobs?cursor=not-valid-base64!!",
      { headers },
      env,
    );
    expect(invalidRes.status).toBe(400);
    const invalidBody = await invalidRes.json<{ error: { code: string } }>();
    expect(invalidBody.error.code).toBe("VALIDATION_ERROR");

    // --- non-existent customer returns empty (not 404) ---
    const missingRes = await app.request(
      "/api/v1/customers/non-existent/wash-jobs?limit=20",
      {
        headers: {
          cookie: `__Host-washpro_session=${rawToken}`,
          origin: "https://washpro.test",
        },
      },
      env,
    );
    expect(missingRes.status).toBe(200);
    const missingBody = await missingRes.json<{
      data: { jobs: unknown[]; hasMore: boolean };
    }>();
    expect(missingBody.data.jobs).toHaveLength(0);
    expect(missingBody.data.hasMore).toBe(false);
  });
});
