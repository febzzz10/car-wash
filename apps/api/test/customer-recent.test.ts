import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const ORG = "org-recent";
const BRANCH = "branch-recent";
const ADMIN = "admin-recent";
const STAFF = "staff-recent";
const adminRawToken = "recent-admin-session";
const staffRawToken = "recent-staff-session";
const otherOrg = "org-recent-other";
const otherBranch = "branch-recent-other";

async function adminHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${adminRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(adminRawToken, env.CSRF_SECRET),
  };
}

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${staffRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(staffRawToken, env.CSRF_SECRET),
  };
}

async function seedCustomer(
  id: string,
  name: string,
  phone: string,
  createdAt: string,
): Promise<void> {
  const nameSearch = name.toLocaleLowerCase("en-IN");
  const digits = phone.replace(/\D/g, "");
  const phoneNorm = digits.length === 10 ? `+91${digits}` : digits;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO customers (
      id, organization_id, home_branch_id, full_name, name_search, phone,
      phone_normalized, registered_at, status, total_visits_cached,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?)`,
  )
    .bind(
      id,
      ORG,
      BRANCH,
      name,
      nameSearch,
      phone,
      phoneNorm,
      createdAt,
      createdAt,
      createdAt,
    )
    .run();
}

beforeEach(async () => {
  const adminHash = await hashSessionToken(adminRawToken, env.SESSION_PEPPER);
  const staffHash = await hashSessionToken(staffRawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES (?, 'Recent Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(ORG),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'MAIN', 'Main', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(BRANCH, ORG),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'Recent Admin', 'recent-admin', 'recent-admin', 'unused', 'ADMIN', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(ADMIN, ORG, BRANCH),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-recent-admin', ?, ?, ?, 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')",
    ).bind(ORG, ADMIN, adminHash),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES (?, ?, ?, 'Recent Staff', 'recent-staff', 'recent-staff', 'unused', 'STAFF', 'ACTIVE', '[\"customers.read\"]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(STAFF, ORG, BRANCH),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-recent-staff', ?, ?, ?, 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')",
    ).bind(ORG, STAFF, staffHash),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES (?, 'Other Recent', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(otherOrg),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'MAIN', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind(otherBranch, otherOrg),
  ]);

  await seedCustomer("recent-a", "Anna", "9000000001", "2026-02-01T10:00:00.000Z");
  await seedCustomer("recent-b", "Ben", "9000000002", "2026-02-02T10:00:00.000Z");
  await seedCustomer("recent-c", "Cathy", "9000000003", "2026-02-03T10:00:00.000Z");
  await seedCustomer("recent-d", "Dan", "9000000004", "2026-02-04T10:00:00.000Z");
  await seedCustomer("recent-e", "Eve", "9000000005", "2026-02-05T10:00:00.000Z");
  await seedCustomer("recent-f", "Finn", "9000000006", "2026-02-06T10:00:00.000Z");
  await seedCustomer("recent-g", "Grace", "9000000007", "2026-02-07T10:00:00.000Z");
  await seedCustomer("recent-inactive", "Inactive", "9000000008", "2026-02-08T10:00:00.000Z");
  await env.DB.prepare(
    "UPDATE customers SET status = 'INACTIVE' WHERE id = ? AND organization_id = ?",
  )
    .bind("recent-inactive", ORG)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO customers (
      id, organization_id, home_branch_id, full_name, name_search, phone,
      phone_normalized, registered_at, status, total_visits_cached,
      created_at, updated_at
    ) VALUES ('recent-other', ?, ?, 'Other Tenant', 'other tenant', '9999999999', '+919999999999', '2026-03-01T00:00:00.000Z', 'ACTIVE', 0, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')`,
  )
    .bind(otherOrg, otherBranch)
    .run();
});

describe("GET /customers?recent=1 — admin", () => {
  it("returns at most 5 customers", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers).toHaveLength(5);
  });

  it("returns the 5 most recently created active customers in order", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const names = body.data.customers.map((c) => c.full_name as string);
    expect(names).toEqual(["Grace", "Finn", "Eve", "Dan", "Cathy"]);
  });

  it("does not return the sixth-oldest customer (Anna)", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const ids = body.data.customers.map((c) => c.id as string);
    expect(ids).not.toContain("recent-a");
    expect(ids).not.toContain("recent-b");
  });

  it("excludes inactive customers", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const ids = body.data.customers.map((c) => c.id as string);
    expect(ids).not.toContain("recent-inactive");
  });

  it("preserves the same response shape as a regular customer lookup", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const grace = body.data.customers[0]!;
    expect(grace.id).toBe("recent-g");
    expect(grace.full_name).toBe("Grace");
    expect(grace.phone).toBe("9000000007");
    expect(grace.status).toBe("ACTIVE");
    expect(grace.total_visits_cached).toBe(0);
    expect(grace.matching_registrations as unknown).toBeUndefined();
  });

  it("is scoped to the organization", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const ids = body.data.customers.map((c) => c.id as string);
    expect(ids).not.toContain("recent-other");
  });

  it("does not interfere with the existing search query", async () => {
    const response = await app.request(
      "/api/v1/customers?search=Anna",
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers).toHaveLength(1);
    expect(body.data.customers[0]!.full_name).toBe("Anna");
  });

  it("does not interfere with phone search", async () => {
    const response = await app.request(
      "/api/v1/customers?search=90000000",
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /customers?recent=1 — staff rejected", () => {
  it("rejects staff with 403", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await staffHeaders() },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("does not return customer data in the 403 response", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1",
      { headers: await staffHeaders() },
      env,
    );
    expect(response.status).toBe(403);
    const body = await response.json<{ data?: unknown }>();
    expect(body.data).toBeUndefined();
  });

  it("rejects staff even when search is also present", async () => {
    const response = await app.request(
      "/api/v1/customers?recent=1&search=Grace",
      { headers: await staffHeaders() },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("staff name search still works", async () => {
    const response = await app.request(
      "/api/v1/customers?search=Anna",
      { headers: await staffHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers).toHaveLength(1);
    expect(body.data.customers[0]!.full_name).toBe("Anna");
  });

  it("staff phone search still works", async () => {
    const response = await app.request(
      "/api/v1/customers?search=90000",
      { headers: await staffHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers.length).toBeGreaterThanOrEqual(1);
  });
});
