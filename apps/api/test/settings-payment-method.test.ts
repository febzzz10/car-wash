import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "settings-payment-method-session-token";
const now = "2026-08-01T10:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, default_currency, created_at, updated_at) VALUES ('org-paymethod', 'Payment Method Test', 'INR', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-paymethod', 'org-paymethod', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-paymethod', 'org-paymethod', 'branch-paymethod', 'Method Admin', 'method-admin', 'method-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-paymethod', 'org-paymethod', 'admin-paymethod', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
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

async function patchDefaultMethod(methodValue: string): Promise<Response> {
  return app.request(
    "/api/v1/settings/business",
    {
      body: JSON.stringify({
        settings: { "payment.default_method": methodValue },
      }),
      headers: await mutationHeaders(),
      method: "PATCH",
    },
    env,
  );
}

async function storedDefaultMethod(): Promise<string | null> {
  return env.DB.prepare(
    "SELECT value_text FROM business_settings WHERE organization_id = 'org-paymethod' AND setting_key = 'payment.default_method'",
  ).first<string>("value_text");
}

describe("settings default payment method validation", () => {
  it("accepts CASH", async () => {
    const response = await patchDefaultMethod("CASH");
    expect(response.status).toBe(200);
    expect(await storedDefaultMethod()).toBe("CASH");
  });

  it("accepts UPI", async () => {
    const response = await patchDefaultMethod("UPI");
    expect(response.status).toBe(200);
    expect(await storedDefaultMethod()).toBe("UPI");
  });

  it("accepts BANK_UPI", async () => {
    const response = await patchDefaultMethod("BANK_UPI");
    expect(response.status).toBe(200);
    expect(await storedDefaultMethod()).toBe("BANK_UPI");
  });

  it("accepts PAYTM", async () => {
    const response = await patchDefaultMethod("PAYTM");
    expect(response.status).toBe(200);
    expect(await storedDefaultMethod()).toBe("PAYTM");
  });

  it("normalizes lowercase upi to UPI", async () => {
    const response = await patchDefaultMethod("upi");
    expect(response.status).toBe(200);
    expect(await storedDefaultMethod()).toBe("UPI");
  });

  it("rejects CARD (legacy method)", async () => {
    const prior = await storedDefaultMethod();
    const response = await patchDefaultMethod("CARD");
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect((body as { error: { code: string } }).error.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(await storedDefaultMethod()).toBe(prior);
  });

  it("rejects BANK_TRANSFER (legacy method)", async () => {
    const prior = await storedDefaultMethod();
    const response = await patchDefaultMethod("BANK_TRANSFER");
    expect(response.status).toBe(422);
    expect(await storedDefaultMethod()).toBe(prior);
  });

  it("rejects OTHER (legacy method)", async () => {
    const prior = await storedDefaultMethod();
    const response = await patchDefaultMethod("OTHER");
    expect(response.status).toBe(422);
    expect(await storedDefaultMethod()).toBe(prior);
  });

  it("rejects arbitrary method value", async () => {
    const prior = await storedDefaultMethod();
    const response = await patchDefaultMethod("CHEQUE");
    expect(response.status).toBe(422);
    expect(await storedDefaultMethod()).toBe(prior);
  });

  it("does not reject payloads that omit payment.default_method", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({ settings: { "business.name": "Renamed Co" } }),
        headers: await mutationHeaders(),
        method: "PATCH",
      },
      env,
    );
    expect(response.status).toBe(200);
  });

  it("preserves existing auth and CSRF checks", async () => {
    const response = await app.request(
      "/api/v1/settings/business",
      {
        body: JSON.stringify({
          settings: { "payment.default_method": "UPI" },
        }),
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

  it("audits default payment method changes", async () => {
    const priorAudits = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-paymethod' AND action = 'BUSINESS_SETTINGS_UPDATED'",
    ).first<number>("count");
    const response = await patchDefaultMethod("UPI");
    expect(response.status).toBe(200);
    const afterAudits = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-paymethod' AND action = 'BUSINESS_SETTINGS_UPDATED'",
    ).first<number>("count");
    expect(afterAudits).toBe((priorAudits ?? 0) + 1);
  });
});
