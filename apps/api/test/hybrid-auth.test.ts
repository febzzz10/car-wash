import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import {
  AUTH_MODE_HYBRID_ADMIN_STAFF,
  AUTH_MODE_STATIC_ADMIN,
} from "../src/routes/auth";
import { hashPassword } from "../src/security/passwords";

const now = "2026-07-23T10:00:00.000Z";

const ADMIN_EMAIL = "admin@washpro.test";
const ADMIN_PASSWORD = "StaticAdmin!Passw0rd";

// Computed with Node.js crypto.pbkdf2Sync (600,000 iterations cannot run
// inside workerd, which is exactly why these hashes must fail safely).
const LEGACY_600K_HASH =
  "pbkdf2-sha256$600000$U-X7Xsqt3enY8OzaimERWA$mDNpXTc1pXtG9A_4lDAVzcyaq1zmqmu8lY9J9UyrqgM";
const LEGACY_PASSWORD = "LegacyWash!234";

const hybridEnv = {
  ...env,
  ADMIN_LOGIN_EMAIL: ADMIN_EMAIL,
  ADMIN_LOGIN_PASSWORD: ADMIN_PASSWORD,
  APP_ENV: "production",
  AUTH_MODE: AUTH_MODE_HYBRID_ADMIN_STAFF,
};

const staticAdminEnv = {
  ...env,
  ADMIN_LOGIN_EMAIL: ADMIN_EMAIL,
  ADMIN_LOGIN_PASSWORD: ADMIN_PASSWORD,
  APP_ENV: "production",
  AUTH_MODE: AUTH_MODE_STATIC_ADMIN,
};

async function seedUser(input: {
  readonly email?: string;
  readonly fullName?: string;
  readonly id: string;
  readonly organizationId?: string;
  readonly permissions?: readonly string[];
  readonly role: "ADMIN" | "STAFF";
  readonly status?: "ACTIVE" | "DISABLED";
  readonly username: string;
  readonly password?: string;
  readonly passwordHash?: string;
}): Promise<void> {
  const passwordHash =
    input.passwordHash ??
    (await hashPassword(input.password ?? "WashPro!234", env.SESSION_PEPPER));
  await env.DB.prepare(
    `INSERT INTO users (
      id, organization_id, default_branch_id, full_name, username,
      username_normalized, email, email_normalized, password_hash, role,
      status, permissions_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.organizationId ?? "org-1",
      input.organizationId === "org-2" ? "branch-2" : "branch-1",
      input.fullName ??
        (input.role === "ADMIN" ? "Admin User" : "Staff User"),
      input.username,
      input.username.trim().toLowerCase(),
      input.email ?? null,
      input.email?.trim().toLowerCase() ?? null,
      passwordHash,
      input.role,
      input.status ?? "ACTIVE",
      input.permissions === undefined
        ? null
        : JSON.stringify(input.permissions),
      now,
      now,
    )
    .run();
}

beforeEach(async () => {
  const adminHash = await hashPassword("HybridAdmin!234", env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-1', 'WashPro Test One', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-2', 'WashPro Test Two', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-1', 'org-1', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-2', 'org-2', 'SECOND', 'Second', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, email, email_normalized, password_hash, role,
        status, permissions_json, created_at, updated_at
      ) VALUES ('hybrid-admin', 'org-1', 'branch-1', 'Hybrid Admin', 'hybrid-admin',
        'hybrid-admin', ?, ?, ?, 'ADMIN', 'ACTIVE', NULL, ?, ?)`,
    ).bind(ADMIN_EMAIL, ADMIN_EMAIL, adminHash, now, now),
  ]);
});

async function login(
  identifier: string,
  password: string,
  runEnv = hybridEnv,
): Promise<{
  cookie: string;
  csrfToken: string;
  response: Response;
}> {
  const response = await app.request(
    "/api/v1/auth/login",
    {
      body: JSON.stringify({ identifier, password }),
      headers: {
        "content-type": "application/json",
        origin: "https://washpro.test",
      },
      method: "POST",
    },
    runEnv,
  );
  const body = await response.clone().json<{
    data?: { csrfToken: string };
  }>();
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    csrfToken: body.data?.csrfToken ?? "",
    response,
  };
}

async function loginStaff(identifier: string): Promise<{
  cookie: string;
  csrfToken: string;
  response: Response;
}> {
  return login(identifier, "WashPro!234");
}

describe("hybrid_admin_staff authentication", () => {
  it("logs in the static administrator with a secure, revocable session", async () => {
    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("set-cookie")).toMatch(
      /HttpOnly.*Secure.*SameSite=Strict/i,
    );
    const body = await result.response.clone().json<{
      data?: {
        csrfToken: string;
        user?: { fullName: string; id: string; role: string };
      };
    }>();
    expect(body.data?.user?.id).toBe("hybrid-admin");
    expect(body.data?.user?.role).toBe("ADMIN");
    expect(body.data?.csrfToken).toBeTruthy();

    const session = await env.DB.prepare(
      "SELECT status, organization_id FROM user_sessions WHERE user_id = 'hybrid-admin'",
    ).first<{ organization_id: string; status: string }>();
    expect(session?.status).toBe("ACTIVE");
    expect(session?.organization_id).toBe("org-1");

    const current = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      hybridEnv,
    );
    expect(current.status).toBe(200);
    const sessionBody = await current.json<{
      data?: { user?: { role: string } };
    }>();
    expect(sessionBody.data?.user?.role).toBe("ADMIN");

    const logout = await app.request(
      "/api/v1/auth/logout",
      {
        headers: {
          cookie: result.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": result.csrfToken,
        },
        method: "POST",
      },
      hybridEnv,
    );
    expect(logout.status).toBe(204);
    expect(
      await env.DB.prepare(
        "SELECT status FROM user_sessions WHERE user_id = 'hybrid-admin'",
      ).first("status"),
    ).toBe("REVOKED");
  });

  it("rejects the static administrator with the generic error on a wrong password", async () => {
    const result = await login(ADMIN_EMAIL, "WrongPassword!99");
    expect(result.response.status).toBe(401);
    expect(await result.response.clone().json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });
    expect(result.response.headers.get("set-cookie")).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE success = 0 AND attempted_identifier = ?",
      )
        .bind(ADMIN_EMAIL)
        .first("count"),
    ).toBe(1);
  });

  it("logs in a staff member by username with role, permissions and tenant scope", async () => {
    await seedUser({
      id: "staff-ravi",
      role: "STAFF",
      username: "ravi.staff",
      permissions: ["CUSTOMERS_VIEW"],
    });

    const result = await loginStaff("RAVI.STAFF");
    expect(result.response.status).toBe(200);
    const body = await result.response.clone().json<{
      data?: {
        user?: {
          branchId: string;
          fullName: string;
          id: string;
          permissions: readonly string[];
          role: string;
          username: string;
        };
      };
    }>();
    expect(body.data?.user?.id).toBe("staff-ravi");
    expect(body.data?.user?.role).toBe("STAFF");
    expect(body.data?.user?.permissions).toEqual(["CUSTOMERS_VIEW"]);
    expect(body.data?.user?.branchId).toBe("branch-1");
    expect(body.data?.user?.username).toBe("ravi.staff");

    const session = await env.DB.prepare(
      "SELECT organization_id FROM user_sessions WHERE user_id = 'staff-ravi'",
    ).first<string>("organization_id");
    expect(session).toBe("org-1");

    const adminRoute = await app.request(
      "/api/v1/admin/staff",
      { headers: { cookie: result.cookie } },
      hybridEnv,
    );
    expect(adminRoute.status).toBe(403);
    expect(await adminRoute.json()).toMatchObject({
      error: { code: "AUTH_PERMISSION_DENIED" },
    });

    const createCustomer = await app.request(
      "/api/v1/customers",
      {
        body: JSON.stringify({ fullName: "Bypass User", phone: "9876500011" }),
        headers: {
          "content-type": "application/json",
          cookie: result.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": result.csrfToken,
        },
        method: "POST",
      },
      hybridEnv,
    );
    expect(createCustomer.status).toBe(403);
  });

  it("logs in a staff member by email case-insensitively", async () => {
    await seedUser({
      id: "staff-meera",
      email: "Meera.Staff@WashPro.Test",
      role: "STAFF",
      username: "meera.staff",
    });

    const result = await loginStaff("meera.staff@washpro.test");
    expect(result.response.status).toBe(200);
    const body = await result.response.clone().json<{
      data?: { user?: { id: string } };
    }>();
    expect(body.data?.user?.id).toBe("staff-meera");
  });

  it("returns the same generic error for an unknown identifier", async () => {
    const result = await loginStaff("no-such-user");
    expect(result.response.status).toBe(401);
    expect(await result.response.clone().json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE matched_user_id IS NULL AND attempted_identifier = 'no-such-user'",
      ).first("count"),
    ).toBe(1);
  });

  it("rejects a disabled staff account without creating a session", async () => {
    await seedUser({
      id: "staff-disabled",
      role: "STAFF",
      status: "DISABLED",
      username: "disabled.staff",
    });

    const result = await loginStaff("disabled.staff");
    expect(result.response.status).toBe(403);
    expect(await result.response.clone().json()).toMatchObject({
      error: { code: "AUTH_ACCOUNT_DISABLED" },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = 'staff-disabled'",
      ).first("count"),
    ).toBe(0);
  });

  it("never lets a database user shadow the static administrator identity", async () => {
    await seedUser({
      id: "org2-shadow",
      email: ADMIN_EMAIL,
      organizationId: "org-2",
      password: "StaffShadow!234",
      role: "STAFF",
      username: "org2-shadow",
    });

    const shadowAttempt = await login(ADMIN_EMAIL, "StaffShadow!234");
    expect(shadowAttempt.response.status).toBe(401);
    expect(await shadowAttempt.response.clone().json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });

    const adminAttempt = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(adminAttempt.response.status).toBe(200);
    const body = await adminAttempt.response.clone().json<{
      data?: { user?: { id: string; role: string } };
    }>();
    expect(body.data?.user?.id).toBe("hybrid-admin");
    expect(body.data?.user?.role).toBe("ADMIN");
  });

  it("fails safely for legacy 600,000-iteration hashes with the generic error", async () => {
    await seedUser({
      id: "staff-legacy",
      passwordHash: LEGACY_600K_HASH,
      role: "STAFF",
      username: "legacy.staff",
    });

    const knownPassword = await login("legacy.staff", LEGACY_PASSWORD);
    expect(knownPassword.response.status).toBe(401);
    expect(await knownPassword.response.clone().json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });

    const unknown = await login("no-such-legacy", LEGACY_PASSWORD);
    expect(unknown.response.status).toBe(401);
    expect(await unknown.response.clone().json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });
  });

  it("scopes staff sessions to their own organization", async () => {
    await seedUser({
      id: "staff-org2",
      email: "org2.staff@washpro.test",
      organizationId: "org-2",
      role: "STAFF",
      username: "org2.staff",
    });

    const result = await loginStaff("org2.staff");
    expect(result.response.status).toBe(200);
    const body = await result.response.clone().json<{
      data?: { user?: { branchId: string } };
    }>();
    expect(body.data?.user?.branchId).toBe("branch-2");

    const session = await env.DB.prepare(
      "SELECT organization_id FROM user_sessions WHERE user_id = 'staff-org2'",
    ).first<string>("organization_id");
    expect(session).toBe("org-2");
  });

  it("lets staff change their password in hybrid mode", async () => {
    await seedUser({
      id: "staff-cp",
      role: "STAFF",
      username: "staff.cp",
    });

    const result = await loginStaff("staff.cp");
    expect(result.response.status).toBe(200);

    const changed = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: "WashPro!234",
          newPassword: "NewPass!5678",
        }),
        headers: {
          "content-type": "application/json",
          cookie: result.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": result.csrfToken,
        },
        method: "POST",
      },
      hybridEnv,
    );
    expect(changed.status).toBe(204);

    const stored = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id = 'staff-cp'",
    ).first<string>("password_hash");
    expect(stored?.startsWith("pbkdf2-sha256$100000$")).toBe(true);

    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'PASSWORD_CHANGED' AND record_id = 'staff-cp'",
    ).first("count");
    expect(audit).toBe(1);

    const revokedSession = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      hybridEnv,
    );
    expect(revokedSession.status).toBe(401);

    const oldPasswordLogin = await login("staff.cp", "WashPro!234");
    expect(oldPasswordLogin.response.status).toBe(401);

    const newPasswordLogin = await login("staff.cp", "NewPass!5678");
    expect(newPasswordLogin.response.status).toBe(200);
  });

  it("rejects static-admin password changes without touching the database or sessions", async () => {
    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.response.status).toBe(200);

    const hashBefore = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id = 'hybrid-admin'",
    ).first<string>("password_hash");

    const changed = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: ADMIN_PASSWORD,
          newPassword: "NewAdminDb!5678",
        }),
        headers: {
          "content-type": "application/json",
          cookie: result.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": result.csrfToken,
        },
        method: "POST",
      },
      hybridEnv,
    );
    expect(changed.status).toBe(403);
    expect(await changed.clone().json()).toMatchObject({
      error: { code: "STATIC_ADMIN_PASSWORD_MANAGED_EXTERNALLY" },
    });

    const hashAfter = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id = 'hybrid-admin'",
    ).first<string>("password_hash");
    expect(hashAfter).toBe(hashBefore);

    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'PASSWORD_CHANGED' AND record_id = 'hybrid-admin'",
    ).first("count");
    expect(audit).toBe(0);

    const sessionStillActive = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      hybridEnv,
    );
    expect(sessionStillActive.status).toBe(200);

    const staticLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(staticLogin.response.status).toBe(200);
  });

  it("applies the login rate limit in hybrid mode", async () => {
    await seedUser({
      id: "staff-ratelimited",
      role: "STAFF",
      username: "ratelimited.staff",
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await login("ratelimited.staff", "WrongPass!999");
      expect(result.response.status).toBe(401);
    }

    const blocked = await login("ratelimited.staff", "WrongPass!999");
    expect(blocked.response.status).toBe(429);
    expect(await blocked.response.clone().json()).toMatchObject({
      error: { code: "AUTH_RATE_LIMITED" },
    });
  });

  it("keeps pure static_admin mode unchanged", async () => {
    const result = await login(ADMIN_EMAIL, ADMIN_PASSWORD, staticAdminEnv);
    expect(result.response.status).toBe(200);
    const body = await result.response.clone().json<{
      data?: { user?: { role: string } };
    }>();
    expect(body.data?.user?.role).toBe("ADMIN");

    const staffAttempt = await login("no-such-user", "WashPro!234", staticAdminEnv);
    expect(staffAttempt.response.status).toBe(401);

    const changed = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: ADMIN_PASSWORD,
          newPassword: "NewAdminDb!5678",
        }),
        headers: {
          "content-type": "application/json",
          cookie: result.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": result.csrfToken,
        },
        method: "POST",
      },
      staticAdminEnv,
    );
    expect(changed.status).toBe(403);
    expect(await changed.clone().json()).toMatchObject({
      error: { code: "AUTH_PERMISSION_DENIED" },
    });
  });
});
