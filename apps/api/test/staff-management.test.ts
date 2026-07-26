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
    expect(await response.json()).toMatchObject({
      data: [{ full_name: "Staff Admin" }, { full_name: "Wash Operator" }],
    });
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
