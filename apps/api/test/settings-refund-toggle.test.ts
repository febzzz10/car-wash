import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "settings-refund-toggle-session-token";
const now = "2026-07-23T14:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, default_currency, created_at, updated_at) VALUES ('org-refund', 'Refund Test', 'INR', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-refund', 'org-refund', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-refund', 'org-refund', 'branch-refund', 'Refund Admin', 'refund-admin', 'refund-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-refund', 'org-refund', 'admin-refund', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
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

describe("settings refund toggle", () => {
  it("GET /settings returns payment.allow_refunds when seeded", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-refund-1', 'org-refund', 'payment.allow_refunds', 'BOOLEAN', 'true', ?)",
    ).bind(now).run();

    const response = await app.request(
      "/api/v1/settings",
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    const settings = (body as any).data.settings as Array<Record<string, unknown>>;
    const refundSetting = settings.find(
      (s: Record<string, unknown>) => s.setting_key === "payment.allow_refunds",
    );
    expect(refundSetting).toBeDefined();
    expect(refundSetting!.value_text).toBe("true");
  });

  it("PATCH /settings/business accepts payment.allow_refunds: true", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "payment.allow_refunds": true } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-refund' AND setting_key = 'payment.allow_refunds'",
    ).first<string>("value_text");
    expect(stored).toBe("true");
  });

  it("PATCH /settings/business accepts payment.allow_refunds: false", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "payment.allow_refunds": false } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-refund' AND setting_key = 'payment.allow_refunds'",
    ).first<string>("value_text");
    expect(stored).toBe("false");
  });

  it("PATCH /settings/business rejects unknown key in business group", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({
          settings: {
            "payment.allow_refunds": true,
            "payment.nonexistent": true,
          },
        }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const body = await response.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /settings does not expose payment.allow_refunds without auth", async () => {
    const response = await app.request(
      "/api/v1/settings",
      {
        headers: {
          "content-type": "application/json",
          origin: "https://washpro.test",
        },
      },
      env,
    );
    expect(response.status).toBe(401);
  });
});
