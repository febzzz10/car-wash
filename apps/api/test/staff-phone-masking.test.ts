import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const timestamp = "2026-08-11T10:00:00.000Z";
const ORG = "org-mask";
const BRANCH = "branch-mask";
const ADMIN = "admin-mask";
const STAFF = "staff-mask";
const CUSTOMER = "customer-mask";
const VTYPE = "vt-mask";
const VEHICLE = "vehicle-mask";
const JOB = "job-mask-1";
const INVOICE = "invoice-mask-1";

const adminRawToken = "phone-mask-admin-session";
const staffRawToken = "phone-mask-staff-session";

async function sessionHeaders(
  rawToken: string,
): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

beforeEach(async () => {
  const adminHash = await hashSessionToken(adminRawToken, env.SESSION_PEPPER);
  const staffHash = await hashSessionToken(staffRawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES (?, 'Mask Test', ?, ?)",
    ).bind(ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'MAIN', 'Main', ?, ?)",
    ).bind(BRANCH, ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'Mask Admin', 'mask-admin', 'mask-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(ADMIN, ORG, BRANCH, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-mask-admin', ?, ?, ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(ORG, ADMIN, adminHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES (?, ?, ?, 'Mask Staff', 'mask-staff', 'mask-staff', 'unused', 'STAFF', 'ACTIVE', '[\"customers.read\",\"customers.update\",\"wash_jobs.read\",\"vehicles.read\",\"invoices.generate\"]', ?, ?)",
    ).bind(STAFF, ORG, BRANCH, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-mask-staff', ?, ?, ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(ORG, STAFF, staffHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES (?, ?, ?, 'Mask Customer', 'mask customer', '9002005005', '+919002005005', ?, 'ACTIVE', 0, ?, ?)",
    ).bind(CUSTOMER, ORG, BRANCH, timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(VTYPE, ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'KL-01-MASK', 'KL01MASK', 'ACTIVE', ?, ?)",
    ).bind(VEHICLE, ORG, CUSTOMER, VTYPE, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, payment_status, subtotal_minor, total_discount_minor, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, rounding_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, 'REF-MASK', ?, ?, ?, 'Mask Customer', '9002005005', 'KL-01-MASK', 'Four Wheeler', 'COMPLETED', 'PENDING', 10000, 0, 0, 0, 0, 0, 0, 10000, 0, 10000, 0, 0, 10000, 0, ?, ?, 1800, 1, 1, 'AT_BUSINESS_LOCATION', ?, ?, ?)`,
    ).bind(
      JOB,
      ORG,
      BRANCH,
      CUSTOMER,
      VEHICLE,
      STAFF,
      timestamp,
      timestamp,
      ADMIN,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO invoices (id, organization_id, branch_id, wash_job_id, invoice_number, revision_number, invoice_status, business_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, subtotal_minor, discount_minor, taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor, balance_minor, currency_code, payment_status_snapshot, invoice_snapshot_json, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, created_at) VALUES (?, ?, ?, ?, 'INV-MASK-1', 0, 'ISSUED', 'Test', 'Mask Customer', '+919002005005', 'KL-01-MASK', 10000, 0, 10000, 0, 0, 10000, 0, 10000, 'INR', 'PENDING', '{}', 0, 0, 0, 0, ?)`,
    ).bind(INVOICE, ORG, BRANCH, JOB, timestamp),
  ]);
});

describe("Staff phone masking", () => {
  it("returns full customer phone and phone_normalized to staff", async () => {
    const response = await app.request(
      "/api/v1/customers?search=mask",
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    const customer = body.data.customers.find((c) => c.id === CUSTOMER);
    expect(customer?.phone).toBe("9002005005");
    expect(customer?.phone_normalized).toBe("+919002005005");
  });

  it("still finds customers by phone number for staff", async () => {
    const response = await app.request(
      "/api/v1/customers?search=90020",
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { customers: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.customers.some((c) => c.id === CUSTOMER)).toBe(true);
  });

  it("masks the wash job phone snapshot for staff and keeps it full for admins", async () => {
    const staffResponse = await app.request(
      "/api/v1/wash-jobs",
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(staffResponse.status).toBe(200);
    const staffBody = await staffResponse.json<{ data: readonly Record<string, unknown>[] }>();
    expect(staffBody.data[0]!.customer_phone_snapshot).toBe("90xxxxxx05");

    const adminResponse = await app.request(
      "/api/v1/wash-jobs",
      { headers: await sessionHeaders(adminRawToken) },
      env,
    );
    const adminBody = await adminResponse.json<{ data: readonly Record<string, unknown>[] }>();
    expect(adminBody.data[0]!.customer_phone_snapshot).toBe("9002005005");
  });

  it("returns full customer phone on vehicles to staff but masks it", async () => {
    const staffResponse = await app.request(
      `/api/v1/vehicles/${VEHICLE}`,
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(staffResponse.status).toBe(200);
    const staffBody = await staffResponse.json<{ data: Record<string, unknown> }>();
    expect(staffBody.data.customer_phone).toBe("90xxxxxx05");

    const adminResponse = await app.request(
      `/api/v1/vehicles/${VEHICLE}`,
      { headers: await sessionHeaders(adminRawToken) },
      env,
    );
    const adminBody = await adminResponse.json<{ data: Record<string, unknown> }>();
    expect(adminBody.data.customer_phone).toBe("9002005005");
  });

  it("masks customer phone snapshots on the vehicle history for staff", async () => {
    const response = await app.request(
      `/api/v1/vehicles/${VEHICLE}/history`,
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: {
        invoices: readonly Record<string, unknown>[];
        washJobs: readonly Record<string, unknown>[];
      };
    }>();
    expect(body.data.washJobs[0]!.customer_phone_snapshot).toBe("90xxxxxx05");
    expect(body.data.invoices[0]!.customer_phone_snapshot).toBe("+91 90xxxxxx05");
  });

  it("masks snapshots on the customer wash-jobs page for staff", async () => {
    const response = await app.request(
      `/api/v1/customers/${CUSTOMER}/wash-jobs?limit=20`,
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { jobs: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.jobs[0]!.customer_phone_snapshot).toBe("90xxxxxx05");
  });

  it("masks snapshots on the customer history page for staff", async () => {
    const response = await app.request(
      `/api/v1/customers/${CUSTOMER}/history`,
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { invoices: readonly Record<string, unknown>[] };
    }>();
    expect(body.data.invoices[0]!.customer_phone_snapshot).toBe("+91 90xxxxxx05");
  });

  it("masks the invoice list and detail phone snapshot for staff", async () => {
    const detailResponse = await app.request(
      `/api/v1/invoices/${INVOICE}`,
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json<{ data: Record<string, unknown> }>();
    expect(detailBody.data.customer_phone_snapshot).toBe("+91 90xxxxxx05");

    const listResponse = await app.request(
      "/api/v1/invoices",
      { headers: await sessionHeaders(staffRawToken) },
      env,
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json<{ data: readonly Record<string, unknown>[] }>();
    expect(listBody.data[0]!.customer_phone_snapshot).toBe("+91 90xxxxxx05");
  });

  it("keeps the invoice phone snapshot full for admins", async () => {
    const response = await app.request(
      `/api/v1/invoices/${INVOICE}`,
      { headers: await sessionHeaders(adminRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ data: Record<string, unknown> }>();
    expect(body.data.customer_phone_snapshot).toBe("+919002005005");
  });
});

describe("Staff customer edit — phone must never be corrupted", () => {
  async function fetchCustomer(name: string): Promise<{
    data: {
      full_name: string;
      phone: string;
      phone_normalized: string;
      version: number;
    };
  }> {
    const response = await app.request(
      `/api/v1/customers/${CUSTOMER}`,
      { headers: await sessionHeaders(name === "staff" ? staffRawToken : adminRawToken) },
      env,
    );
    expect(response.status).toBe(200);
    return response.json<{
      data: {
        full_name: string;
        phone: string;
        phone_normalized: string;
        version: number;
      };
    }>();
  }

  it("keeps the real database phone when staff edits only the customer name", async () => {
    const customer = (await fetchCustomer("staff")).data;
    expect(customer.phone).toBe("9002005005");

    const patch = await app.request(
      `/api/v1/customers/${CUSTOMER}`,
      {
        body: JSON.stringify({
          fullName: "Mask Customer Renamed",
          version: customer.version,
        }),
        headers: await sessionHeaders(staffRawToken),
        method: "PATCH",
      },
      env,
    );
    expect(patch.status).toBe(200);

    const updated = (await fetchCustomer("staff")).data;
    expect(updated.full_name).toBe("Mask Customer Renamed");
    expect(updated.phone).toBe("9002005005");
    expect(updated.phone_normalized).toBe("+919002005005");
  });

  it("serves the full phone to the staff edit form so a masked value is never preloaded or saved back", async () => {
    const customer = (await fetchCustomer("staff")).data;

    const patch = await app.request(
      `/api/v1/customers/${CUSTOMER}`,
      {
        body: JSON.stringify({
          fullName: "Mask Customer",
          phone: customer.phone,
          version: customer.version,
        }),
        headers: await sessionHeaders(staffRawToken),
        method: "PATCH",
      },
      env,
    );
    expect(patch.status).toBe(200);

    const updated = (await fetchCustomer("staff")).data;
    expect(updated.phone).toBe("9002005005");
    expect(updated.phone_normalized).toBe("+919002005005");
  });

  it("rejects a masked phone value on staff customer updates with 422, protecting the database", async () => {
    const customer = (await fetchCustomer("staff")).data;

    const patch = await app.request(
      `/api/v1/customers/${CUSTOMER}`,
      {
        body: JSON.stringify({
          fullName: "Mask Customer",
          phone: "90xxxxxx05",
          version: customer.version,
        }),
        headers: await sessionHeaders(staffRawToken),
        method: "PATCH",
      },
      env,
    );
    expect(patch.status).toBe(422);

    const updated = (await fetchCustomer("admin")).data;
    expect(updated.phone).toBe("9002005005");
    expect(updated.phone_normalized).toBe("+919002005005");
  });

  it("keeps the real phone when an admin edits only the customer name", async () => {
    const customer = (await fetchCustomer("admin")).data;

    const patch = await app.request(
      `/api/v1/customers/${CUSTOMER}`,
      {
        body: JSON.stringify({
          fullName: "Mask Customer",
          version: customer.version,
        }),
        headers: await sessionHeaders(adminRawToken),
        method: "PATCH",
      },
      env,
    );
    expect(patch.status).toBe(200);

    const updated = (await fetchCustomer("admin")).data;
    expect(updated.phone).toBe("9002005005");
    expect(updated.phone_normalized).toBe("+919002005005");
  });
});