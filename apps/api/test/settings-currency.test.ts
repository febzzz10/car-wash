import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "settings-currency-session-token";
const now = "2026-07-23T14:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, default_currency, created_at, updated_at) VALUES ('org-currency', 'Currency Test', 'INR', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-currency', 'org-currency', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-currency', 'org-currency', 'branch-currency', 'Currency Admin', 'currency-admin', 'currency-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-currency', 'org-currency', 'admin-currency', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
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

describe("settings currency validation", () => {
  it("accepts INR", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "INR" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe("INR");
  });

  it("normalizes lowercase inr to INR", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "inr" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe("INR");
  });

  it("trims whitespace around INR", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "  INR  " } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe("INR");
  });

  it("rejects ₹ (rupee sign)", async () => {
    const priorRow = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "₹" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const body = await response.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("VALIDATION_ERROR");
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe(priorRow);
  });

  it("rejects $ (dollar sign)", async () => {
    const prior = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "$" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe(prior);
  });

  it("rejects unsupported three-letter code", async () => {
    const prior = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "XYZ" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe(prior);
  });

  it("rejects empty currency", async () => {
    const prior = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(422);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe(prior);
  });

  it("persists USD (valid ISO code)", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "USD" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const stored = await env.DB.prepare(
      "SELECT value_text FROM business_settings WHERE organization_id = 'org-currency' AND setting_key = 'business.currency'",
    ).first<string>("value_text");
    expect(stored).toBe("USD");
  });

  it("preserves existing auth and CSRF checks", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "INR" } }),
        headers: {
          "content-type": "application/json",
          origin: "https://washpro.test",
        },
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("audits currency changes", async () => {
    const priorAudits = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-currency' AND action = 'BUSINESS_SETTINGS_UPDATED'",
    ).first<number>("count");
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.currency": "AED" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
    const afterAudits = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-currency' AND action = 'BUSINESS_SETTINGS_UPDATED'",
    ).first<number>("count");
    expect(afterAudits).toBe((priorAudits ?? 0) + 1);
  });
});
