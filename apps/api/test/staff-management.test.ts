import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const adminRawToken = "staff-management-admin-session";
const staffRawToken = "staff-member-session-token";
const timestamp = "2026-07-23T13:00:00.000Z";

let staffTokenHash: string;

beforeEach(async () => {
  const adminTokenHash = await hashSessionToken(
    adminRawToken,
    env.SESSION_PEPPER,
  );
  staffTokenHash = await hashSessionToken(staffRawToken, env.SESSION_PEPPER);
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
    ).bind(adminTokenHash, timestamp, timestamp),
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

async function getVersion(userId: string): Promise<number> {
  return (await env.DB.prepare("SELECT version FROM users WHERE id = ?")
    .bind(userId)
    .first<number>("version")) as number;
}

async function createTargetStaff(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('target-staff', 'org-staff', 'branch-staff', 'Target Staff', 'target', 'target', 'unused', 'STAFF', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-target-staff', 'org-staff', 'target-staff', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffTokenHash, timestamp, timestamp),
  ]);
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

  it("disables a staff account without a reason", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    const version = await getVersion("target-staff");
    const response = await app.request(
      "/api/v1/users/target-staff/disable",
      {
        body: JSON.stringify({ version }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);

    const user = await env.DB.prepare(
      "SELECT status, disabled_reason, disabled_by_user_id FROM users WHERE id = 'target-staff'",
    ).first<{ status: string; disabled_reason: string | null; disabled_by_user_id: string | null }>();
    expect(user?.status).toBe("DISABLED");
    expect(user?.disabled_reason).toBeNull();
    expect(user?.disabled_by_user_id).toBe("admin-staff");

    const audit = await env.DB.prepare(
      "SELECT action, reason, severity FROM audit_logs WHERE record_id = 'target-staff' ORDER BY created_at DESC LIMIT 1",
    ).first<{ action: string; reason: string; severity: string }>();
    expect(audit?.action).toBe("USER_DISABLED");
    expect(audit?.reason).toBe("Staff account disabled by administrator");
    expect(audit?.severity).toBe("CRITICAL");
  });

  it("enables a staff account without a reason", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    await env.DB.prepare(
      "UPDATE users SET status = 'DISABLED', disabled_at = ?, disabled_by_user_id = 'admin-staff', disabled_reason = 'Old reason', updated_at = ?, version = version + 1 WHERE id = 'target-staff'",
    )
      .bind(timestamp, timestamp)
      .run();

    const version = await getVersion("target-staff");
    const response = await app.request(
      "/api/v1/users/target-staff/enable",
      {
        body: JSON.stringify({ version }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);

    const user = await env.DB.prepare(
      "SELECT status, disabled_reason, disabled_by_user_id FROM users WHERE id = 'target-staff'",
    ).first<{ status: string; disabled_reason: string | null; disabled_by_user_id: string | null }>();
    expect(user?.status).toBe("ACTIVE");
    expect(user?.disabled_reason).toBeNull();
    expect(user?.disabled_by_user_id).toBeNull();

    const audit = await env.DB.prepare(
      "SELECT action, reason, severity FROM audit_logs WHERE record_id = 'target-staff' AND action = 'USER_ENABLED' ORDER BY created_at DESC LIMIT 1",
    ).first<{ action: string; reason: string; severity: string }>();
    expect(audit?.action).toBe("USER_ENABLED");
    expect(audit?.reason).toBe("Staff account activated by administrator");
    expect(audit?.severity).toBe("CRITICAL");
  });

  it("resets a staff password without a reason", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    const response = await app.request(
      "/api/v1/users/target-staff/reset-password",
      {
        body: JSON.stringify({ temporaryPassword: "NewSecure@1234" }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(204);

    const user = await env.DB.prepare(
      "SELECT must_change_password FROM users WHERE id = 'target-staff'",
    ).first<{ must_change_password: number }>();
    expect(user?.must_change_password).toBe(1);

    const audit = await env.DB.prepare(
      "SELECT action, reason, severity FROM audit_logs WHERE record_id = 'target-staff' AND action = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
    ).first<{ action: string; reason: string; severity: string }>();
    expect(audit?.action).toBe("PASSWORD_RESET");
    expect(audit?.reason).toBe("Staff password reset by administrator");
    expect(audit?.severity).toBe("CRITICAL");
  });

  it("revokes sessions when disabling a staff account", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    const version = await getVersion("target-staff");

    await app.request(
      "/api/v1/users/target-staff/disable",
      {
        body: JSON.stringify({ version }),
        headers,
        method: "POST",
      },
      env,
    );

    const revoked = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: `__Host-washpro_session=${staffRawToken}` } },
      env,
    );
    expect(revoked.status).toBe(401);
  });

  it("revokes sessions when resetting a staff password", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();

    await app.request(
      "/api/v1/users/target-staff/reset-password",
      {
        body: JSON.stringify({ temporaryPassword: "NewSecure@1234" }),
        headers,
        method: "POST",
      },
      env,
    );

    const revoked = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: `__Host-washpro_session=${staffRawToken}` } },
      env,
    );
    expect(revoked.status).toBe(401);
  });

  it("rejects disable by non-admin user", async () => {
    const staffSessionToken = "non-admin-session-token-12345";
    const staffSessionHash = await hashSessionToken(
      staffSessionToken,
      env.SESSION_PEPPER,
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('non-admin-staff', 'org-staff', 'branch-staff', 'Non Admin', 'nonadmin', 'nonadmin', 'unused', 'STAFF', 'ACTIVE', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-non-admin', 'org-staff', 'non-admin-staff', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
      ).bind(staffSessionHash, timestamp, timestamp),
    ]);

    const nonAdminHeaders: Record<string, string> = {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${staffSessionToken}`,
      origin: "https://washpro.test",
      "x-csrf-token": await createCsrfToken(
        staffSessionToken,
        env.CSRF_SECRET,
      ),
    };

    const version = await getVersion("non-admin-staff");
    const response = await app.request(
      "/api/v1/users/non-admin-staff/disable",
      {
        body: JSON.stringify({ version }),
        headers: nonAdminHeaders,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
  });



  it("rejects disable when version conflicts", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    const response = await app.request(
      "/api/v1/users/target-staff/disable",
      {
        body: JSON.stringify({ version: 999 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(409);
  });

  it("accepts legacy reason field for backward compatibility", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();
    const version = await getVersion("target-staff");
    const response = await app.request(
      "/api/v1/users/target-staff/disable",
      {
        body: JSON.stringify({
          reason: "Legacy reason still accepted",
          version,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);

    const user = await env.DB.prepare(
      "SELECT status, disabled_reason FROM users WHERE id = 'target-staff'",
    ).first<{ status: string; disabled_reason: string | null }>();
    expect(user?.disabled_reason).toBe("Legacy reason still accepted");

    const audit = await env.DB.prepare(
      "SELECT reason FROM audit_logs WHERE record_id = 'target-staff' AND action = 'USER_DISABLED' ORDER BY created_at DESC LIMIT 1",
    ).first<{ reason: string }>();
    expect(audit?.reason).toBe("Legacy reason still accepted");
  });

  it("prevents the last active Admin from being disabled", async () => {
    const headers = await adminHeaders();
    const version = await getVersion("admin-staff");
    const response = await app.request(
      "/api/v1/users/admin-staff/disable",
      {
        body: JSON.stringify({ version }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(409);
  });

  it("audit entries never expose password values", async () => {
    await createTargetStaff();
    const headers = await adminHeaders();

    await app.request(
      "/api/v1/users/target-staff/reset-password",
      {
        body: JSON.stringify({ temporaryPassword: "NewSecure@1234" }),
        headers,
        method: "POST",
      },
      env,
    );

    const audits = await env.DB.prepare(
      "SELECT previous_value_json, new_value_json FROM audit_logs WHERE record_id = 'target-staff' AND action = 'PASSWORD_RESET'",
    ).all<{ previous_value_json: string | null; new_value_json: string | null }>();

    for (const audit of audits.results) {
      if (audit.previous_value_json !== null) {
        expect(audit.previous_value_json).not.toContain("NewSecure");
        expect(audit.previous_value_json).not.toContain("password_hash");
      }
      if (audit.new_value_json !== null) {
        expect(audit.new_value_json).not.toContain("NewSecure");
        expect(audit.new_value_json).not.toContain("password_hash");
      }
    }
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

    const version = await getVersion(created.data.id);
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
