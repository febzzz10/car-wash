import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "settings-manual-discount-toggle-session-token";
const now = "2026-08-01T10:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, default_currency, created_at, updated_at) VALUES ('org-mandisc', 'Manual Discount Test', 'INR', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-mandisc', 'org-mandisc', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-mandisc', 'org-mandisc', 'branch-mandisc', 'Manual Discount Admin', 'mandisc-admin', 'mandisc-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-mandisc', 'org-mandisc', 'admin-mandisc', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
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

describe("settings manual discount toggle", () => {
  it("GET /settings returns payment.manual_discount_enabled when seeded", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-mandisc-1', 'org-mandisc', 'payment.manual_discount_enabled', 'BOOLEAN', 'true', ?)",
    ).bind(now).run();

    const response = await app.request(
      "/api/v1/settings",
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    const settings = (body as any).data.settings as Array<Record<string, unknown>>;
    const setting = settings.find(
      (s: Record<string, unknown>) => s.setting_key === "payment.manual_discount_enabled",
    );
    expect(setting).toBeDefined();
    expect(setting!.value_text).toBe("true");
  });

  it("PATCH /settings/business accepts payment.manual_discount_enabled: true", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "payment.manual_discount_enabled": true } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-mandisc' AND setting_key = 'payment.manual_discount_enabled'",
    ).first<string>("value_text");
    expect(stored).toBe("true");
  });

  it("PATCH /settings/business accepts payment.manual_discount_enabled: false", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "payment.manual_discount_enabled": false } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-mandisc' AND setting_key = 'payment.manual_discount_enabled'",
    ).first<string>("value_text");
    expect(stored).toBe("false");
  });

  it("PATCH /settings/business rejects non-boolean manual discount value", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "payment.manual_discount_enabled": "yes" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const body = await response.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /settings/business rejects unknown key alongside manual discount key", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({
          settings: {
            "payment.manual_discount_enabled": true,
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

  it("GET /settings does not expose payment.manual_discount_enabled without auth", async () => {
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

  it("GET /auth/session exposes manualDiscountEnabled false when unset", async () => {
    const response = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect((body as any).data.manualDiscountEnabled).toBe(false);
  });

  it("GET /auth/session exposes manualDiscountEnabled true after enabling", async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-mandisc-2', 'org-mandisc', 'payment.manual_discount_enabled', 'BOOLEAN', 'true', ?)",
    ).bind(now).run();

    const response = await app.request(
      "/api/v1/auth/session",
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect((body as any).data.manualDiscountEnabled).toBe(true);
  });
});
