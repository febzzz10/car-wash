import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";
import { runScheduledMaintenance } from "../src/services/maintenance";

const rawToken = "settings-maintenance-session-token";
const now = "2026-07-23T14:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-settings', 'Settings Test', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-settings', 'org-settings', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-settings', 'org-settings', 'branch-settings', 'Settings Admin', 'settings-admin', 'settings-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-settings', 'org-settings', 'admin-settings', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, now, now),
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

describe("settings and scheduled retention", () => {
  it("persists typed retention settings, audits them, and applies the configured login retention", async () => {
    const response = await app.request(
      "/api/v1/settings/security",
      {
        body: JSON.stringify({
          settings: {
            "privacy.location_retention_days": 30,
            "privacy.login_attempt_retention_days": 1,
            "privacy.photo_retention_days": 30,
            "privacy.temporary_file_retention_days": 7,
            "security.session_timeout_minutes": 120,
          },
        }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT value_text FROM business_settings WHERE organization_id = 'org-settings' AND setting_key = 'privacy.login_attempt_retention_days'",
      ).first("value_text"),
    ).toBe("1");
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-settings' AND action = 'BUSINESS_SETTINGS_UPDATED'",
      ).first("count"),
    ).toBe(1);

    await env.DB.prepare(
      "INSERT INTO login_attempts (id, organization_id, attempted_identifier, success, attempted_at) VALUES ('old-login-attempt', 'org-settings', 'old-user', 0, '2026-07-20T00:00:00.000Z')",
    ).run();
    await runScheduledMaintenance(env, new Date(now));
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE id = 'old-login-attempt'",
      ).first("count"),
    ).toBe(0);
  });
});
