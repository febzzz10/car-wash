import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "immutable-assignment-session";
const timestamp = "2026-07-28T10:00:00.000Z";

let jobCounter = 0;

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-imm', 'Immutable Assignment Test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, latitude, longitude, allowed_radius_meters, minimum_gps_accuracy_meters, created_at, updated_at) VALUES ('branch-imm', 'org-imm', 'MAIN', 'Main', 10, 76, 150, 50, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-imm', 'org-imm', 'branch-imm', 'Immutable Admin', 'imm-admin', 'imm-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-imm', 'org-imm', 'branch-imm', 'Arun Kumar', 'imm-staff', 'imm-staff', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-imm-2', 'org-imm', 'branch-imm', 'Second Staff', 'imm-staff-2', 'imm-staff-2', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-imm', 'org-imm', 'admin-imm', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('vt-imm', 'org-imm', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES ('customer-imm', 'org-imm', 'branch-imm', 'Test Customer', 'test customer', '9999999900', '9999999900', ?, 'ACTIVE', 0, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES ('vehicle-imm', 'org-imm', 'customer-imm', 'vt-imm', 'IMM-01', 'IMM01', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, estimated_duration_minutes, is_taxable, created_at, updated_at) VALUES ('svc-imm', 'org-imm', 'IMM', 'Immutable Service', 'PRIMARY', 5000, 30, 0, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, effective_from, created_at) VALUES ('sp-imm', 'org-imm', 'svc-imm', 'vt-imm', 5000, '2026-01-01T00:00:00.000Z', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, asset_type, access_level, upload_status, mime_type, size_bytes, metadata_json, created_at) VALUES ('fa-imm', 'org-imm', 'branch-imm', 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'image/jpeg', 50000, '{\"captureSource\":\"CAMERA\",\"width\":1920,\"height\":1080}', ?)",
    ).bind(timestamp),
  ]);
});

async function mutationHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

function makeJobId(): string {
  jobCounter++;
  return `imm-job-${jobCounter}`;
}

async function insertWashJob(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = (overrides.id as string) ?? makeJobId();
  const assignedUserId = (overrides.assigned_user_id as string) ?? "staff-imm";
  const snapshot = overrides.assigned_user_name_snapshot !== undefined
    ? (overrides.assigned_user_name_snapshot as string | null)
    : "Arun Kumar";
  await env.DB.prepare(
    `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, assigned_user_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, subtotal_minor, total_amount_minor, balance_minor, tax_rate_basis_points, mandatory_photo_verified, mandatory_location_verified, created_by_user_id, updated_by_user_id, created_at, updated_at)
     VALUES (?, 'org-imm', 'branch-imm', ?, 'customer-imm', 'vehicle-imm', ?, ?, 'Test', '000', 'REG', 'Four Wheeler', 'WAITING', 5000, 5000, 5000, 0, 1, 0, 'admin-imm', 'admin-imm', ?, ?)`,
  ).bind(
    id, `${id}-REF`, assignedUserId, snapshot, timestamp, timestamp,
  ).run();
  return id;
}

async function getDetail(jobId: string): Promise<Record<string, unknown>> {
  const headers = await mutationHeaders();
  const response = await app.request(
    `/api/v1/wash-jobs/${jobId}`,
    { headers: { cookie: headers.cookie ?? "" } },
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json<{ data: Record<string, unknown> }>()).data;
}

describe("Immutable assignment — detail endpoint", () => {
  it("A. returns originally assigned staff", async () => {
    const jobId = await insertWashJob();
    const detail = await getDetail(jobId);
    expect(detail.assigned_user_id).toBe("staff-imm");
    expect(detail.assigned_user_full_name).toBe("Arun Kumar");
    expect(detail.id).toBe(jobId);
  });

  it("B. disabled staff remains visible", async () => {
    const jobId = await insertWashJob();
    await env.DB.prepare(
      "UPDATE users SET status = 'DISABLED', updated_at = ? WHERE id = 'staff-imm'",
    ).bind(timestamp).run();
    const detail = await getDetail(jobId);
    expect(detail.assigned_user_id).toBe("staff-imm");
    expect(detail.assigned_user_full_name).toBe("Arun Kumar");
  });

  it("D. legacy record without snapshot falls back to current user name", async () => {
    const jobId = makeJobId();
    await env.DB.prepare(
      `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, subtotal_minor, total_amount_minor, balance_minor, tax_rate_basis_points, mandatory_photo_verified, mandatory_location_verified, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      jobId, 'org-imm', 'branch-imm', `IMM-LEGACY-${jobCounter}`, 'customer-imm', 'vehicle-imm', 'staff-imm', 'Test', '000', 'REG', 'Four Wheeler', 'WAITING', 5000, 5000, 5000, 0, 1, 0, 'admin-imm', 'admin-imm', timestamp, timestamp,
    ).run();
    const detail = await getDetail(jobId);
    expect(detail.assigned_user_id).toBe("staff-imm");
    expect(detail.assigned_user_full_name).toBe("Arun Kumar");
  });

  it("C. staff rename does not change historical name", async () => {
    const jobId = await insertWashJob();
    const snapshot = await env.DB.prepare(
      "SELECT assigned_user_name_snapshot FROM wash_jobs WHERE id = ?",
    ).bind(jobId).first<string>("assigned_user_name_snapshot");
    expect(snapshot).toBe("Arun Kumar");
    await env.DB.prepare(
      "UPDATE users SET full_name = 'Arun K.', updated_at = ? WHERE id = 'staff-imm'",
    ).bind(timestamp).run();
    const detail = await getDetail(jobId);
    expect(detail.assigned_user_full_name).toBe("Arun Kumar");
  });

  it("E. detail endpoint returns snapshot even when assigned user is from another branch", async () => {
    const jobId = makeJobId();
    await env.DB.prepare(
      `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, assigned_user_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, subtotal_minor, total_amount_minor, balance_minor, tax_rate_basis_points, mandatory_photo_verified, mandatory_location_verified, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      jobId, 'org-imm', 'branch-imm', `IMM-SNAPSHOT-${jobCounter}`, 'customer-imm', 'vehicle-imm', 'staff-imm', 'Original Name', 'Test', '000', 'REG', 'Four Wheeler', 'WAITING', 5000, 5000, 5000, 0, 1, 0, 'admin-imm', 'admin-imm', timestamp, timestamp,
    ).run();
    const detail = await getDetail(jobId);
    expect(detail.assigned_user_id).toBe("staff-imm");
    expect(detail.assigned_user_full_name).toBe("Original Name");
  });
});

describe("Immutable assignment — reassignment endpoint", () => {
  it("F. reassignment returns 409", async () => {
    const jobId = await insertWashJob();
    const headers = await mutationHeaders();
    const response = await app.request(
      `/api/v1/wash-jobs/${jobId}/assignment`,
      {
        body: JSON.stringify({
          assignedUserId: "staff-imm-2",
          reason: "Testing blocked reassignment",
          version: 1,
        }),
        headers,
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(409);
    const body = await response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe("ASSIGNMENT_LOCKED");
    expect(body.error.message).toMatch(/permanent/);
  });

  it("G. reassignment does not modify the database", async () => {
    const jobId = await insertWashJob({ assigned_user_name_snapshot: "Original Name" });
    const before = await env.DB.prepare(
      "SELECT assigned_user_id, assigned_user_name_snapshot, version FROM wash_jobs WHERE id = ?",
    ).bind(jobId).first<{
      assigned_user_id: string;
      assigned_user_name_snapshot: string | null;
      version: number;
    }>();
    expect(before).not.toBeNull();
    const headers = await mutationHeaders();
    const response = await app.request(
      `/api/v1/wash-jobs/${jobId}/assignment`,
      {
        body: JSON.stringify({
          assignedUserId: "staff-imm-2",
          reason: "Should not change anything",
          version: before!.version,
        }),
        headers,
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(409);
    const after = await env.DB.prepare(
      "SELECT assigned_user_id, assigned_user_name_snapshot, version FROM wash_jobs WHERE id = ?",
    ).bind(jobId).first<{
      assigned_user_id: string;
      assigned_user_name_snapshot: string | null;
      version: number;
    }>();
    expect(after!.assigned_user_id).toBe(before!.assigned_user_id);
    expect(after!.assigned_user_name_snapshot).toBe(before!.assigned_user_name_snapshot);
    expect(after!.version).toBe(before!.version);
  });

  it("H. reassignment cannot clear assignment", async () => {
    const jobId = await insertWashJob();
    const before = await env.DB.prepare(
      "SELECT assigned_user_id, assigned_user_name_snapshot FROM wash_jobs WHERE id = ?",
    ).bind(jobId).first<{
      assigned_user_id: string;
      assigned_user_name_snapshot: string | null;
    }>();
    const headers = await mutationHeaders();
    const response = await app.request(
      `/api/v1/wash-jobs/${jobId}/assignment`,
      {
        body: JSON.stringify({
          assignedUserId: null,
          reason: "Trying to clear",
          version: 999,
        }),
        headers,
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(409);
    const after = await env.DB.prepare(
      "SELECT assigned_user_id, assigned_user_name_snapshot FROM wash_jobs WHERE id = ?",
    ).bind(jobId).first<{
      assigned_user_id: string;
      assigned_user_name_snapshot: string | null;
    }>();
    expect(after!.assigned_user_id).toBe(before!.assigned_user_id);
    expect(after!.assigned_user_name_snapshot).toBe(before!.assigned_user_name_snapshot);
  });
});
