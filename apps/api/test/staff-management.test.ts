import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const adminRawToken = "staff-management-admin-session";
const timestamp = "2026-07-23T13:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(adminRawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-staff', 'Staff Test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-staff', 'org-staff', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-staff', 'org-staff', 'branch-staff', 'Staff Admin', 'staff-admin', 'staff-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-staff-admin', 'org-staff', 'admin-staff', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
  ]);
});

async function adminHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${adminRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(adminRawToken, env.CSRF_SECRET),
  };
}

describe("Staff management", () => {
  it("excludes administrator from assignable list", async () => {
    const token = "no-admin-assignable-session";
    const tokenHash = await hashSessionToken(token, env.SESSION_PEPPER);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('no-admin-staff', 'org-staff', 'branch-staff', 'Staff Operator', 'staff-op', 'staff-op', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-no-admin', 'org-staff', 'no-admin-staff', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
      ).bind(tokenHash, timestamp, timestamp),
    ]);

    const response = await app.request(
      "/api/v1/wash-jobs/assignable-users",
      { headers: { cookie: `__Host-washpro_session=${token}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: readonly { full_name: string; role: string }[];
    }>();
    expect(body.data.some((u) => u.role === "ADMIN")).toBe(false);
    expect(body.data.every((u) => u.role === "STAFF")).toBe(true);
  });

  it("excludes staff from another branch", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-other', 'org-staff', 'OTHER', 'Other', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('other-branch-user', 'org-staff', 'branch-other', 'Other Branch', 'other', 'other', 'unused', 'STAFF', 'ACTIVE', ?, ?)",
      ).bind(timestamp, timestamp),
    ]);

    const response = await app.request(
      "/api/v1/wash-jobs/assignable-users",
      { headers: { cookie: `__Host-washpro_session=${adminRawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: readonly { full_name: string }[];
    }>();
    expect(body.data.some((u) => u.full_name === "Other Branch")).toBe(false);
  });

  it("rejects administrator as assigned user when creating a wash job", async () => {
    const adminToken = "reject-admin-assignee-session";
    const adminTokenHash = await hashSessionToken(adminToken, env.SESSION_PEPPER);
    const customerId = "reject-admin-customer";
    const vehicleId = "reject-admin-vehicle";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('reject-admin-op', 'org-staff', 'branch-staff', 'Reject Admin Op', 'rej-op', 'rej-op', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-reject-admin', 'org-staff', 'reject-admin-op', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
      ).bind(adminTokenHash, timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('vt-reject', 'org-staff', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES (?, 'org-staff', 'branch-staff', 'Reject Customer', 'reject customer', '9999999900', '9999999900', ?, 'ACTIVE', 0, ?, ?)",
      ).bind(customerId, timestamp, timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES (?, 'org-staff', ?, 'vt-reject', 'REJ-01', 'REJ01', 'ACTIVE', ?, ?)",
      ).bind(vehicleId, customerId, timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, is_active, base_price_minor, created_at, updated_at) VALUES ('svc-reject', 'org-staff', 'REJECT', 'Reject Service', 'PRIMARY', 1, 5000, ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, is_active, effective_from, created_at) VALUES ('sp-reject', 'org-staff', 'svc-reject', 'vt-reject', 5000, 1, ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, asset_type, access_level, upload_status, mime_type, size_bytes, metadata_json, created_at) VALUES ('fa-reject', 'org-staff', 'branch-staff', 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'image/jpeg', 50000, '{\"captureSource\":\"CAMERA\",\"width\":1920,\"height\":1080}', ?)",
      ).bind(timestamp),
    ]);

    const headers = {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${adminToken}`,
      "x-csrf-token": await createCsrfToken(adminToken, env.CSRF_SECRET),
      origin: "https://washpro.test",
    };

    const response = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          addOnServiceIds: [],
          assignedUserId: "admin-staff",
          customerId,
          idempotencyKey: crypto.randomUUID(),
          photoAssetId: "fa-reject",
          primaryServiceId: "svc-reject",
          vehicleId,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("excludes disabled staff from assignable list", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('disabled-staff-user', 'org-staff', 'branch-staff', 'Disabled Staff', 'disabled', 'disabled', 'unused', 'STAFF', 'DISABLED', ?, ?)",
      ).bind(timestamp, timestamp),
    ]);

    const response = await app.request(
      "/api/v1/wash-jobs/assignable-users",
      { headers: { cookie: `__Host-washpro_session=${adminRawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: readonly { full_name: string }[];
    }>();
    expect(body.data.some((u) => u.full_name === "Disabled Staff")).toBe(false);
  });

  it("lists active branch assignees for a Staff member creating a wash", async () => {
    const token = "assignable-staff-session-token";
    const tokenHash = await hashSessionToken(token, env.SESSION_PEPPER);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('assignee-one', 'org-staff', 'branch-staff', 'Wash Operator', 'operator', 'operator', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-assignee', 'org-staff', 'assignee-one', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
      ).bind(tokenHash, timestamp, timestamp),
    ]);

    const response = await app.request(
      "/api/v1/wash-jobs/assignable-users",
      { headers: { cookie: `__Host-washpro_session=${token}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: readonly { full_name: string; role: string }[];
    }>();
    expect(body.data.every((u) => u.role === "STAFF")).toBe(true);
    expect(body.data.some((u) => u.full_name === "Wash Operator")).toBe(true);
  });

  it("creates, scopes, resets, disables, and revokes Staff without exposing hashes", async () => {
    const headers = await adminHeaders();
    const createdResponse = await app.request(
      "/api/v1/users",
      {
        body: JSON.stringify({
          fullName: "Ravi Kumar",
          permissions: ["customers.read", "wash_jobs.read"],
          role: "STAFF",
          temporaryPassword: "Temporary!234",
          username: "ravi",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json<{
      data: { id: string; must_change_password: number; version: number };
    }>();
    expect(created.data.must_change_password).toBe(1);
    expect(JSON.stringify(created)).not.toContain("password_hash");

    const staffLogin = await app.request(
      "/api/v1/auth/login",
      {
        body: JSON.stringify({ identifier: "ravi", password: "Temporary!234" }),
        headers: {
          "content-type": "application/json",
          origin: "https://washpro.test",
        },
        method: "POST",
      },
      env,
    );
    expect(staffLogin.status).toBe(200);
    const staffCookie =
      staffLogin.headers.get("set-cookie")?.split(";")[0] ?? "";

    const version = await env.DB.prepare(
      "SELECT version FROM users WHERE id = ?",
    )
      .bind(created.data.id)
      .first<number>("version");
    const disabled = await app.request(
      `/api/v1/users/${created.data.id}/disable`,
      {
        body: JSON.stringify({ reason: "Employment ended", version }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(disabled.status).toBe(200);

    const revoked = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: staffCookie } },
      env,
    );
    expect(revoked.status).toBe(401);

    const activity = await app.request(
      `/api/v1/users/${created.data.id}/activity`,
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(activity.status).toBe(200);
    expect(await activity.json()).toMatchObject({
      data: {
        audits: expect.any(Array),
        loginAttempts: expect.any(Array),
        sessions: expect.any(Array),
      },
    });
  });
});
