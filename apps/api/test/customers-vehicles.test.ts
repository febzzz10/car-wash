import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const timestamp = "2026-07-23T11:00:00.000Z";
const rawToken = "customer-vehicle-test-session-token";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-cv', 'WashPro CV', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-cv', 'org-cv', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-cv', 'org-cv', 'branch-cv', 'Admin CV', 'admin-cv',
        'admin-cv', 'not-used-in-session-tests', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-cv', 'org-cv', 'admin-cv', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('vehicle-type-cv', 'org-cv', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
  ]);
});

async function headers(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

describe("customer and vehicle management", () => {
  it("normalizes, scopes, deduplicates, updates, and exposes history", async () => {
    const requestHeaders = await headers();
    const createCustomer = await app.request(
      "/api/v1/customers",
      {
        body: JSON.stringify({
          email: "  CUSTOMER@Example.COM ",
          fullName: "  Asha   Nair ",
          phone: "09876543210",
        }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(createCustomer.status).toBe(201);
    const customerBody = await createCustomer.json<{
      data: { id: string; phone_normalized: string; version: number };
    }>();
    expect(customerBody.data.phone_normalized).toBe("+919876543210");

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-cv-other', 'Other Wash', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('customer-cv-other', 'org-cv-other', 'Other Tenant', 'other tenant', '9876500099', '+919876500099', ?, ?, ?)",
      ).bind(timestamp, timestamp, timestamp),
    ]);

    const duplicate = await app.request(
      "/api/v1/customers",
      {
        body: JSON.stringify({
          fullName: "Other Name",
          phone: "+91 98765 43210",
        }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: { code: "DUPLICATE_CUSTOMER" },
    });

    const search = await app.request(
      "/api/v1/customers?search=98765",
      { headers: { cookie: requestHeaders["cookie"] ?? "" } },
      env,
    );
    expect(search.status).toBe(200);
    expect(
      (await search.json<{ data: { customers: unknown[] } }>()).data.customers,
    ).toHaveLength(1);

    const injection = await app.request(
      "/api/v1/customers?search=%27%20OR%201%3D1%20--",
      { headers: { cookie: requestHeaders["cookie"] ?? "" } },
      env,
    );
    expect(injection.status).toBe(200);
    expect(
      (await injection.json<{ data: { customers: unknown[] } }>()).data
        .customers,
    ).toHaveLength(0);

    const staleUpdate = await app.request(
      `/api/v1/customers/${customerBody.data.id}`,
      {
        body: JSON.stringify({ fullName: "Asha Menon", version: 99 }),
        headers: requestHeaders,
        method: "PATCH",
      },
      env,
    );
    expect(staleUpdate.status).toBe(409);

    const createVehicle = await app.request(
      "/api/v1/vehicles",
      {
        body: JSON.stringify({
          customerId: customerBody.data.id,
          make: "Honda",
          registrationNumber: "kl-07 ab 1234",
          vehicleTypeCode: "FOUR_WHEELER",
        }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(createVehicle.status).toBe(201);
    const vehicleBody = await createVehicle.json<{
      data: {
        id: string;
        registration_normalized: string;
        registration_number: string;
        version: number;
      };
    }>();
    expect(vehicleBody.data.registration_number).toBe("KL 07 AB 1234");
    expect(vehicleBody.data.registration_normalized).toBe("KL07AB1234");

    const clearedVehicleField = await app.request(
      `/api/v1/vehicles/${vehicleBody.data.id}`,
      {
        body: JSON.stringify({ make: null, version: vehicleBody.data.version }),
        headers: requestHeaders,
        method: "PATCH",
      },
      env,
    );
    expect(clearedVehicleField.status).toBe(200);
    expect(await clearedVehicleField.json()).toMatchObject({
      data: { make: null, version: 2 },
    });

    const duplicateVehicle = await app.request(
      "/api/v1/vehicles",
      {
        body: JSON.stringify({
          customerId: customerBody.data.id,
          registrationNumber: "KL07AB1234",
          vehicleTypeCode: "FOUR_WHEELER",
        }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(duplicateVehicle.status).toBe(409);
    expect(await duplicateVehicle.json()).toMatchObject({
      error: { code: "DUPLICATE_VEHICLE" },
    });

    const history = await app.request(
      `/api/v1/customers/${customerBody.data.id}/history`,
      { headers: { cookie: requestHeaders["cookie"] ?? "" } },
      env,
    );
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      data: {
        coupons: [],
        invoices: [],
        locations: [],
        payments: [],
        photos: [],
        referrals: [],
      },
    });

    const auditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-cv' AND record_type IN ('CUSTOMER', 'VEHICLE')",
    ).first<number>("count");
    expect(auditCount).toBe(3);
  });
});
