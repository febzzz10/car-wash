import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { hashSessionToken } from "../src/security/tokens";

const timestamp = "2026-07-23T11:00:00.000Z";
const rawToken = "customer-registration-search-session-token";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-reg', 'WashPro Reg', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-reg', 'org-reg', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status, created_at, updated_at
      ) VALUES ('admin-reg', 'org-reg', 'branch-reg', 'Admin Reg', 'admin-reg',
        'admin-reg', 'not-used-in-session-tests', 'ADMIN', 'ACTIVE', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-reg', 'org-reg', 'admin-reg', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('vehicle-type-reg', 'org-reg', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (
        id, organization_id, home_branch_id, full_name, name_search, phone,
        phone_normalized, registered_at, created_at, updated_at
      ) VALUES ('customer-reg-1', 'org-reg', 'branch-reg', 'Ravi Kumar',
        'ravi kumar', '9876543210', '+919876543210', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (
        id, organization_id, home_branch_id, full_name, name_search, phone,
        phone_normalized, registered_at, created_at, updated_at
      ) VALUES ('customer-reg-2', 'org-reg', 'branch-reg', 'Sita Menon',
        'sita menon', '9988776655', '+919988776655', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (
        id, organization_id, customer_id, vehicle_type_id, registration_number,
        registration_normalized, created_at, updated_at
      ) VALUES ('vehicle-reg-1', 'org-reg', 'customer-reg-1', 'vehicle-type-reg',
        'KL 01 AB 1234', 'KL01AB1234', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (
        id, organization_id, customer_id, vehicle_type_id, registration_number,
        registration_normalized, created_at, updated_at
      ) VALUES ('vehicle-reg-2', 'org-reg', 'customer-reg-1', 'vehicle-type-reg',
        'KL 02 CD 5678', 'KL02CD5678', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (
        id, organization_id, customer_id, vehicle_type_id, registration_number,
        registration_normalized, created_at, updated_at
      ) VALUES ('vehicle-reg-3', 'org-reg', 'customer-reg-2', 'vehicle-type-reg',
        'KL 03 EF 9012', 'KL03EF9012', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-reg-other', 'Other Reg', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (
        id, organization_id, full_name, name_search, phone,
        phone_normalized, registered_at, created_at, updated_at
      ) VALUES ('customer-reg-other', 'org-reg-other', 'Other Tenant',
        'other tenant', '9000011111', '+919000011111', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_types (
        id, organization_id, code, name, created_at, updated_at
      ) VALUES ('vehicle-type-reg-other', 'org-reg-other', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (
        id, organization_id, customer_id, vehicle_type_id, registration_number,
        registration_normalized, created_at, updated_at
      ) VALUES ('vehicle-reg-other', 'org-reg-other', 'customer-reg-other',
        'vehicle-type-reg-other', 'KL 01 AB 1234', 'KL01AB1234', ?, ?)`,
    ).bind(timestamp, timestamp),
  ]);
});

async function search(query: string): Promise<{
  readonly data: readonly Record<string, unknown>[];
  readonly status: number;
}> {
  const response = await app.request(
    `/api/v1/customers?search=${encodeURIComponent(query)}`,
    { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
    env,
  );
  return {
    data: (await response.json<{ data: readonly Record<string, unknown>[] }>())
      .data,
    status: response.status,
  };
}

describe("customer search by vehicle registration", () => {
  it("matches an exact registration number and returns the linked customer", async () => {
    const result = await search("KL01AB1234");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "customer-reg-1",
      full_name: "Ravi Kumar",
      matching_registrations: ["KL 01 AB 1234"],
    });
  });

  it("matches a lowercase registration number", async () => {
    const result = await search("kl01ab1234");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-1" });
  });

  it("matches a registration number with spaces", async () => {
    const result = await search("KL 01 AB 1234");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "customer-reg-1",
      matching_registrations: ["KL 01 AB 1234"],
    });
  });

  it("matches a registration number with hyphens", async () => {
    const result = await search("KL-01-AB-1234");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-1" });
  });

  it("links the registration to the correct customer", async () => {
    const result = await search("KL03EF9012");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "customer-reg-2",
      full_name: "Sita Menon",
      matching_registrations: ["KL 03 EF 9012"],
    });
  });

  it("does not duplicate a customer matching name and registration", async () => {
    const result = await search("Ravi");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-1" });
  });

  it("does not duplicate a customer owning multiple matching vehicles", async () => {
    const result = await search("KL02CD5678");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "customer-reg-1",
      matching_registrations: ["KL 02 CD 5678"],
    });
  });

  it("does not return customers or vehicles from another business", async () => {
    const result = await search("KL01AB1234");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-1" });
    expect(result.data[0]).not.toMatchObject({ id: "customer-reg-other" });
  });

  it("keeps existing name search working", async () => {
    const result = await search("sita");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-2" });
  });

  it("keeps existing phone search and phone normalization working", async () => {
    const result = await search("99887");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "customer-reg-2" });
  });

  it("returns an empty result list when nothing matches", async () => {
    const result = await search("ZZ99ZZ9999");
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(0);
  });
});
