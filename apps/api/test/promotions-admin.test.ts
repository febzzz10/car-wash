import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const token = "promotion-admin-session-token";
const now = "2026-07-23T12:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(token, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-promo', 'Promo Test', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-promo', 'org-promo', 'MAIN', 'Main', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-promo', 'org-promo', 'branch-promo', 'Promo Admin', 'promo-admin', 'promo-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-promo', 'org-promo', 'admin-promo', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('vehicle-type-promo', 'org-promo', 'SEDAN', 'Sedan', ?, ?)",
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, created_by_user_id, created_at, updated_at) VALUES ('service-promo', 'org-promo', 'BASIC', 'Basic wash', 'PRIMARY', 50000, 'admin-promo', ?, ?)",
    ).bind(now, now),
  ]);
});

async function headers(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${token}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(token, env.CSRF_SECRET),
  };
}

describe("promotion administration", () => {
  it("creates, scopes, and disables a coupon with eligibility rules", async () => {
    const requestHeaders = await headers();
    const body = {
      code: " wash 25 ",
      discountType: "PERCENTAGE",
      discountValue: 2500,
      eligibleServiceIds: ["service-promo"],
      eligibleVehicleTypeIds: ["vehicle-type-promo"],
      expiresAt: "2027-01-31T23:59:59.000Z",
      maximumDiscountMinor: 15000,
      minimumBillMinor: 50000,
      newCustomersOnly: true,
      startAt: "2026-07-01T00:00:00.000Z",
      totalUsageLimit: 100,
      usageLimitPerCustomer: 1,
    };
    const created = await app.request(
      "/api/v1/coupons",
      { body: JSON.stringify(body), headers: requestHeaders, method: "POST" },
      env,
    );
    expect(created.status).toBe(201);
    const payload = await created.json<{
      data: { code_normalized: string; id: string };
    }>();
    expect(payload.data.code_normalized).toBe("WASH25");

    const duplicate = await app.request(
      "/api/v1/coupons",
      {
        body: JSON.stringify({ ...body, code: "WASH-25" }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(duplicate.status).toBe(409);

    const disabled = await app.request(
      `/api/v1/coupons/${payload.data.id}/disable`,
      { headers: requestHeaders, method: "POST" },
      env,
    );
    expect(disabled.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT is_active FROM coupons WHERE id = ?")
        .bind(payload.data.id)
        .first<number>("is_active"),
    ).toBe(0);

    const list = await app.request(
      "/api/v1/coupons",
      { headers: { cookie: requestHeaders.cookie ?? "" } },
      env,
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      data: [
        {
          code_normalized: "WASH25",
          eligible_service_count: 1,
          eligible_vehicle_type_count: 1,
        },
      ],
    });
  });
});
