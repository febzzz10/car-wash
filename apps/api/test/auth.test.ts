import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashPassword } from "../src/security/passwords";

const now = "2026-07-23T10:00:00.000Z";

async function seedUser(
  id: string,
  username: string,
  role: "ADMIN" | "STAFF",
  status: "ACTIVE" | "DISABLED" = "ACTIVE",
): Promise<void> {
  const passwordHash = await hashPassword("WashPro!234", env.SESSION_PEPPER);
  await env.DB.prepare(
    `INSERT INTO users (
      id, organization_id, default_branch_id, full_name, username,
      username_normalized, password_hash, role, status, permissions_json,
      password_changed_at, created_at, updated_at
    ) VALUES (?, 'org-1', 'branch-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      role === "ADMIN" ? "Admin User" : "Staff User",
      username,
      username.toLowerCase(),
      passwordHash,
      role,
      status,
      role === "STAFF" ? JSON.stringify(["CUSTOMERS_VIEW"]) : null,
      now,
      now,
      now,
    )
    .run();
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-1', 'WashPro Test', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-1', 'org-1', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
  ]);
});

async function login(username: string): Promise<{
  cookie: string;
  csrfToken: string;
  response: Response;
}> {
  const response = await app.request(
    "/api/v1/auth/login",
    {
      body: JSON.stringify({ identifier: username, password: "WashPro!234" }),
      headers: {
        "content-type": "application/json",
        origin: "https://washpro.test",
      },
      method: "POST",
    },
    env,
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

describe("authentication and authorization", () => {
  it("creates a hashed, secure, revocable Admin session", async () => {
    await seedUser("admin-session-1", "admin-session", "ADMIN");

    const result = await login("ADMIN-SESSION");
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("set-cookie")).toMatch(
      /HttpOnly.*Secure.*SameSite=Strict/i,
    );

    const session = await env.DB.prepare(
      "SELECT token_hash, status FROM user_sessions WHERE user_id = 'admin-session-1'",
    ).first<{ status: string; token_hash: string }>();
    const rawToken = result.cookie.split("=")[1];
    expect(session?.status).toBe("ACTIVE");
    expect(session?.token_hash).not.toBe(rawToken);

    const current = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      env,
    );
    expect(current.status).toBe(200);

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
      env,
    );
    expect(logout.status).toBe(204);
    expect(
      await env.DB.prepare(
        "SELECT status FROM user_sessions WHERE user_id = 'admin-session-1'",
      ).first("status"),
    ).toBe("REVOKED");
  });

  it("logs invalid attempts without revealing whether the user exists", async () => {
    await seedUser("admin-invalid-1", "admin-invalid", "ADMIN");

    const response = await app.request(
      "/api/v1/auth/login",
      {
        body: JSON.stringify({
          identifier: "admin-invalid",
          password: "incorrect",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://washpro.test",
        },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE attempted_identifier = 'admin-invalid'",
      ).first("count"),
    ).toBe(1);
  });

  it("rejects disabled accounts and prevents Staff from reaching Admin routes", async () => {
    await seedUser("disabled-1", "disabled", "STAFF", "DISABLED");
    await seedUser("staff-1", "staff", "STAFF");

    const disabled = await login("disabled");
    expect(disabled.response.status).toBe(403);

    const staff = await login("staff");
    const adminRoute = await app.request(
      "/api/v1/admin/staff",
      { headers: { cookie: staff.cookie } },
      env,
    );
    expect(adminRoute.status).toBe(403);
    expect(await adminRoute.json()).toMatchObject({
      error: { code: "AUTH_PERMISSION_DENIED" },
    });

    const bypass = await app.request(
      "/api/v1/customers",
      {
        body: JSON.stringify({ fullName: "Bypass User", phone: "9876500011" }),
        headers: {
          "content-type": "application/json",
          cookie: staff.cookie,
          origin: "https://washpro.test",
          "x-csrf-token": staff.csrfToken,
        },
        method: "POST",
      },
      env,
    );
    expect(bypass.status).toBe(403);
    expect(await bypass.json()).toMatchObject({
      error: { code: "AUTH_PERMISSION_DENIED" },
    });
  });

  it("rejects an expired server session even when the cookie is present", async () => {
    await seedUser("expired-session-user", "expired-session", "ADMIN");
    const result = await login("expired-session");
    await env.DB.prepare(
      "UPDATE user_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = 'expired-session-user'",
    ).run();
    const response = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTH_SESSION_EXPIRED" },
    });
  });

  it("rejects state-changing requests without a matching origin and CSRF token", async () => {
    await seedUser("admin-csrf-1", "admin-csrf", "ADMIN");
    const result = await login("admin-csrf");

    const response = await app.request(
      "/api/v1/auth/logout",
      {
        headers: { cookie: result.cookie, origin: "https://evil.test" },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CSRF_REJECTED" },
    });
  });

  it("exposes manualDiscountEnabled false on login when the setting is unset", async () => {
    await seedUser("admin-mandisc-default", "admin-mandisc-default", "ADMIN");
    const result = await login("admin-mandisc-default");
    expect(result.response.status).toBe(200);
    const body = await result.response.clone().json<{
      data?: { manualDiscountEnabled: boolean };
    }>();
    expect(body.data?.manualDiscountEnabled).toBe(false);
  });

  it("exposes manualDiscountEnabled true on login when enabled", async () => {
    await seedUser("admin-mandisc-on", "admin-mandisc-on", "ADMIN");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-mandisc-auth', 'org-1', 'payment.manual_discount_enabled', 'BOOLEAN', 'true', ?)",
    ).bind(now).run();

    const result = await login("admin-mandisc-on");
    const body = await result.response.clone().json<{
      data?: { manualDiscountEnabled: boolean };
    }>();
    expect(body.data?.manualDiscountEnabled).toBe(true);

    const session = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      env,
    );
    expect(session.status).toBe(200);
    const sessionBody = await session.json<{
      data?: { manualDiscountEnabled: boolean };
    }>();
    expect(sessionBody.data?.manualDiscountEnabled).toBe(true);
  });

  it("changes the password to a verifiable 100,000-iteration hash and revokes sessions", async () => {
    await seedUser("cp-user", "cp-user", "ADMIN");
    const result = await login("cp-user");
    expect(result.response.status).toBe(200);
    const headers = {
      "content-type": "application/json",
      cookie: result.cookie,
      origin: "https://washpro.test",
      "x-csrf-token": result.csrfToken,
    };

    const wrongCurrent = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: "WrongPass!999",
          newPassword: "NewPass!5678",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(wrongCurrent.status).toBe(401);
    expect(await wrongCurrent.json()).toMatchObject({
      error: { code: "AUTH_INVALID_CREDENTIALS" },
    });

    const weakNew = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: "WashPro!234",
          newPassword: "short",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(weakNew.status).toBe(422);

    const samePassword = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: "WashPro!234",
          newPassword: "WashPro!234",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(samePassword.status).toBe(422);

    const changed = await app.request(
      "/api/v1/auth/change-password",
      {
        body: JSON.stringify({
          currentPassword: "WashPro!234",
          newPassword: "NewPass!5678",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(changed.status).toBe(204);

    const stored = await env.DB.prepare(
      "SELECT password_hash, must_change_password FROM users WHERE id = 'cp-user'",
    ).first<{ password_hash: string; must_change_password: number }>();
    expect(stored?.password_hash.startsWith("pbkdf2-sha256$100000$")).toBe(
      true,
    );
    expect(stored?.password_hash).not.toContain("NewPass!5678");
    expect(stored?.must_change_password).toBe(0);

    const revokedSession = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: result.cookie } },
      env,
    );
    expect(revokedSession.status).toBe(401);

    const oldPasswordLogin = await login("cp-user");
    expect(oldPasswordLogin.response.status).toBe(401);

    const newPasswordLogin = await app.request(
      "/api/v1/auth/login",
      {
        body: JSON.stringify({
          identifier: "cp-user",
          password: "NewPass!5678",
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://washpro.test",
        },
        method: "POST",
      },
      env,
    );
    expect(newPasswordLogin.status).toBe(200);

    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'PASSWORD_CHANGED' AND record_id = 'cp-user'",
    ).first("count");
    expect(audit).toBe(1);
  });
});
