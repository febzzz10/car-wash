import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "discount-breakdown-session";
const timestamp = "2026-07-30T15:00:00.000Z";
const ORG = "org-discount";
const BRANCH = "branch-discount";
const ADMIN = "admin-discount";
const CUSTOMER = "customer-discount";
const VTYPE = "vt-discount";
const VEHICLE = "vehicle-discount";
const SERVICE = "service-discount";

function idemKey(suffix: string | number): string {
  return `idem-${ORG}-${suffix}`.padEnd(16, "x");
}

let seq = 0;
function nextSeq(): number {
  seq++;
  return seq;
}

async function generateInvoice(jobId: string, key: string): Promise<Response> {
  return await app.request(
    `/api/v1/wash-jobs/${jobId}/invoice`,
    {
      body: JSON.stringify({ idempotencyKey: key }),
      headers: {
        "content-type": "application/json",
        cookie: `__Host-washpro_session=${rawToken}`,
        origin: "https://washpro.test",
        "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
      },
      method: "POST",
    },
    env,
  );
}

async function getInvoiceById(id: string): Promise<Record<string, unknown>> {
  const response = await app.request(
    `/api/v1/invoices/${id}`,
    {
      headers: {
        cookie: `__Host-washpro_session=${rawToken}`,
        origin: "https://washpro.test",
        "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
      },
    },
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ data: Record<string, unknown> }>();
  return body.data;
}

function insertJobSql(jobId: string, coupon: number, referral: number, reward: number, manual: number): string {
  const discount = coupon + referral + reward + manual;
  const subtotal = 10000;
  const taxable = subtotal - discount;
  const tax = 0;
  const rounding = 0;
  const total = subtotal - discount + tax + rounding;
  return `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, payment_status, subtotal_minor, total_discount_minor, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, rounding_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES ('${jobId}', '${ORG}', '${BRANCH}', 'REF-${jobId}', '${CUSTOMER}', '${VEHICLE}', '${ADMIN}', 'Test', '9876500001', 'KL-DISC', 'Four Wheeler', 'COMPLETED', 'PENDING', ${subtotal}, ${discount}, ${coupon}, ${referral}, ${reward}, ${manual}, ${rounding}, ${taxable}, ${tax}, ${total}, 0, 0, ${total}, 0, '${timestamp}', '${timestamp}', 1800, 1, 1, 'AT_BUSINESS_LOCATION', '${ADMIN}', '${timestamp}', '${timestamp}')`;
}

function insertItemSql(jobId: string): string {
  return `INSERT INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, display_order, created_at) VALUES ('wji-${jobId}', '${jobId}', '${SERVICE}', 'PRIMARY', 'DISC', 'Disc Test', 1, 10000, 10000, 0, 10000, 0, 0, 10000, 0, '${timestamp}')`;
}

async function createJobAndItem(jobId: string, coupon: number, referral = 0, reward = 0, manual = 0): Promise<void> {
  await env.DB.prepare(insertJobSql(jobId, coupon, referral, reward, manual)).run();
  await env.DB.prepare(insertItemSql(jobId)).run();
}

async function seedJob(jobId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, payment_status, subtotal_minor, total_discount_minor, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, rounding_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Test', '+910000000000', 'KL-LEG', 'Four Wheeler', 'COMPLETED', 'PENDING', 10000, 0, 0, 0, 0, 0, 0, 10000, 0, 10000, 0, 0, 10000, 0, ?, ?, ?)`,
  ).bind(jobId, ORG, BRANCH, `REF-${jobId}`, CUSTOMER, VEHICLE, ADMIN, ADMIN, timestamp, timestamp).run();
}

async function insertLegacyInvoice(invoiceId: string, jobId: string, invoiceNum: string, subtotal: number, discount: number, snap: string): Promise<void> {
  const taxable = subtotal - discount;
  const total = taxable;
  await env.DB.prepare(
    `INSERT INTO invoices (id, organization_id, branch_id, wash_job_id, invoice_number, revision_number, invoice_status, business_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, subtotal_minor, discount_minor, taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor, balance_minor, currency_code, payment_status_snapshot, invoice_snapshot_json, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, created_at) VALUES (?, ?, ?, ?, ?, 0, 'ISSUED', 'Test', 'Test', '+910000000000', 'KL-LEG', ?, ?, ?, 0, 0, ?, 0, ?, 'INR', 'PENDING', ?, 0, 0, 0, 0, ?)`,
  ).bind(invoiceId, ORG, BRANCH, jobId, invoiceNum, subtotal, discount, taxable, total, total, snap, timestamp).run();
}

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES (?, 'Discount Breakdown Test', ?, ?)",
    ).bind(ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES (?, ?, 'MAIN', 'Main', '1 Road', 'Kochi', 'Kerala', '+919999999999', '+919999999999', 'hello@test.test', ?, ?)",
    ).bind(BRANCH, ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, 'Discount Admin', 'disc-admin', 'disc-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(ADMIN, ORG, BRANCH, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind("session-discount", ORG, ADMIN, tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, email, address, registered_at, created_at, updated_at) VALUES (?, ?, 'Test Customer', 'test customer', '9876500001', '+919876500001', 'test@example.com', 'Kochi', ?, ?, ?)",
    ).bind(CUSTOMER, ORG, timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES (?, ?, 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(VTYPE, ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES (?, ?, ?, ?, 'KL-01-DISC', 'KL01DISC', 'Tata', 'Nexon', ?, ?)",
    ).bind(VEHICLE, ORG, CUSTOMER, VTYPE, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, created_at, updated_at) VALUES (?, ?, 'DISC', 'Discount Test Service', 'PRIMARY', 10000, ?, ?)",
    ).bind(SERVICE, ORG, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES (?, ?, 'invoice.prefix', 'STRING', 'DB', ?)",
    ).bind("setting-prefix-disc", ORG, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES (?, ?, 'invoice.footer', 'STRING', 'Thanks.', ?)",
    ).bind("setting-footer-disc", ORG, timestamp),
  ]);
});

describe("new invoice discount breakdown", () => {
  it("creates an invoice with coupon discount only", async () => {
    const s = nextSeq();
    const jobId = `job-disc-coupon-${s}`;
    await createJobAndItem(jobId, 1000);

    const response = await generateInvoice(jobId, idemKey(`coupon-${s}`));
    expect(response.status).toBe(201);

    const body = await response.json<{ data: Record<string, unknown> }>();
    expect(body.data.coupon_discount_minor).toBe(1000);
    expect(body.data.referral_discount_minor).toBe(0);
    expect(body.data.reward_discount_minor).toBe(0);
    expect(body.data.manual_discount_minor).toBe(0);
    expect(body.data.discount_minor).toBe(1000);
    expect(body.data.rounding_minor).toBe(0);

    const invoice = await getInvoiceById(body.data.id as string);
    expect(invoice.coupon_discount_minor).toBe(1000);
    expect(invoice.discount_minor).toBe(1000);
  });

  it("creates an invoice with referral discount only", async () => {
    const s = nextSeq();
    const jobId = `job-disc-referral-${s}`;
    await createJobAndItem(jobId, 0, 2000);

    const response = await generateInvoice(jobId, idemKey(`referral-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.referral_discount_minor).toBe(2000);
    expect(invoice.reward_discount_minor).toBe(0);
    expect(invoice.manual_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(2000);
  });

  it("creates an invoice with reward discount only", async () => {
    const s = nextSeq();
    const jobId = `job-disc-reward-${s}`;
    await createJobAndItem(jobId, 0, 0, 1500);

    const response = await generateInvoice(jobId, idemKey(`reward-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.referral_discount_minor).toBe(0);
    expect(invoice.reward_discount_minor).toBe(1500);
    expect(invoice.manual_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(1500);
  });

  it("creates an invoice with manual discount only", async () => {
    const s = nextSeq();
    const jobId = `job-disc-manual-${s}`;
    await createJobAndItem(jobId, 0, 0, 0, 3000);

    const response = await generateInvoice(jobId, idemKey(`manual-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.referral_discount_minor).toBe(0);
    expect(invoice.reward_discount_minor).toBe(0);
    expect(invoice.manual_discount_minor).toBe(3000);
    expect(invoice.discount_minor).toBe(3000);
  });

  it("creates an invoice with multiple discount categories", async () => {
    const s = nextSeq();
    const jobId = `job-disc-multi-${s}`;
    await createJobAndItem(jobId, 1000, 2000, 500, 1500);

    const response = await generateInvoice(jobId, idemKey(`multi-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    expect(invoice.coupon_discount_minor).toBe(1000);
    expect(invoice.referral_discount_minor).toBe(2000);
    expect(invoice.reward_discount_minor).toBe(500);
    expect(invoice.manual_discount_minor).toBe(1500);
    expect(invoice.discount_minor).toBe(5000);
  });

  it("creates an invoice with no discount", async () => {
    const s = nextSeq();
    const jobId = `job-disc-none-${s}`;
    await createJobAndItem(jobId, 0);

    const response = await generateInvoice(jobId, idemKey(`none-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.referral_discount_minor).toBe(0);
    expect(invoice.reward_discount_minor).toBe(0);
    expect(invoice.manual_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(0);
  });

  it("discount_minor equals sum of all category fields", async () => {
    const s = nextSeq();
    const jobId = `job-disc-sum-${s}`;
    await createJobAndItem(jobId, 500, 1000, 250, 750);

    const response = await generateInvoice(jobId, idemKey(`sum-${s}`));
    expect(response.status).toBe(201);

    const invoice = await getInvoiceById(
      (await response.json<{ data: Record<string, unknown> }>()).data.id as string,
    );
    const sum = (invoice.coupon_discount_minor as number)
      + (invoice.referral_discount_minor as number)
      + (invoice.reward_discount_minor as number)
      + (invoice.manual_discount_minor as number);
    expect(sum).toBe(invoice.discount_minor as number);
  });

  it("snapshot JSON stores categorized discounts", async () => {
    const s = nextSeq();
    const jobId = `job-disc-snap-${s}`;
    await createJobAndItem(jobId, 1000, 2000, 500, 500);

    const response = await generateInvoice(jobId, idemKey(`snap-${s}`));
    expect(response.status).toBe(201);
    const body = await response.json<{ data: Record<string, unknown> }>();

    const snapStr = await env.DB.prepare(
      "SELECT invoice_snapshot_json FROM invoices WHERE id = ?",
    ).bind(body.data.id as string).first<string>("invoice_snapshot_json");
    expect(snapStr).not.toBeNull();

    const snap = JSON.parse(snapStr!);
    expect(snap.couponDiscountMinor).toBe(1000);
    expect(snap.referralDiscountMinor).toBe(2000);
    expect(snap.rewardDiscountMinor).toBe(500);
    expect(snap.manualDiscountMinor).toBe(500);
    expect(snap.discountMinor).toBe(4000);
    expect(snap.roundingMinor).toBe(0);
  });
});

describe("legacy invoice compatibility", () => {
  it("A. snapshot has valid category fields — returns categorized breakdown", async () => {
    const jobId = `job-legacy-A-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-A-${nextSeq()}`;
    const snap = JSON.stringify({
      discountMinor: 5000, couponDiscountMinor: 2000, referralDiscountMinor: 1000,
      rewardDiscountMinor: 500, manualDiscountMinor: 1500, subtotalMinor: 15000,
      items: [{ name: "Test" }],
    });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-A", 15000, 5000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(2000);
    expect(invoice.referral_discount_minor).toBe(1000);
    expect(invoice.reward_discount_minor).toBe(500);
    expect(invoice.manual_discount_minor).toBe(1500);
    expect(invoice.discount_minor).toBe(5000);
  });

  it("B. snapshot has no category fields — returns zeros with discount_minor", async () => {
    const jobId = `job-legacy-B-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-B-${nextSeq()}`;
    const snap = JSON.stringify({ discountMinor: 4000, items: [{ name: "Test" }] });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-B", 12000, 4000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.referral_discount_minor).toBe(0);
    expect(invoice.reward_discount_minor).toBe(0);
    expect(invoice.manual_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(4000);
  });

  it("C1. snapshot has negative values — falls back", async () => {
    const jobId = `job-legacy-C1-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-C1-${nextSeq()}`;
    const snap = JSON.stringify({
      discountMinor: 2000, couponDiscountMinor: -500, referralDiscountMinor: 1000,
      rewardDiscountMinor: 1000, manualDiscountMinor: 500, items: [{ name: "Test" }],
    });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-C1", 10000, 2000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(2000);
  });

  it("C2. snapshot sum differs from discount_minor — falls back", async () => {
    const jobId = `job-legacy-C2-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-C2-${nextSeq()}`;
    const snap = JSON.stringify({
      discountMinor: 5000, couponDiscountMinor: 1000, referralDiscountMinor: 1000,
      rewardDiscountMinor: 1000, manualDiscountMinor: 1000, items: [{ name: "Test" }],
    });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-C2", 10000, 5000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(5000);
  });

  it("C3. snapshot has decimal values — falls back", async () => {
    const jobId = `job-legacy-C3-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-C3-${nextSeq()}`;
    const snap = JSON.stringify({
      discountMinor: 2000, couponDiscountMinor: 10.5, referralDiscountMinor: 1000,
      rewardDiscountMinor: 500, manualDiscountMinor: 500, items: [{ name: "Test" }],
    });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-C3", 10000, 2000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(2000);
  });

  it("C4. snapshot has null values — falls back", async () => {
    const jobId = `job-legacy-C4-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-C4-${nextSeq()}`;
    const snap = JSON.stringify({
      discountMinor: 2000, couponDiscountMinor: null, referralDiscountMinor: 1000,
      rewardDiscountMinor: 500, manualDiscountMinor: 500, items: [{ name: "Test" }],
    });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-C4", 10000, 2000, snap);

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(2000);
  });

  it("C5. snapshot is malformed JSON — falls back", async () => {
    const jobId = `job-legacy-C5-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-C5-${nextSeq()}`;
    await env.DB.prepare(
      `INSERT INTO invoices (id, organization_id, branch_id, wash_job_id, invoice_number, revision_number, invoice_status, business_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, subtotal_minor, discount_minor, taxable_amount_minor, tax_minor, rounding_minor, total_minor, paid_minor, balance_minor, currency_code, payment_status_snapshot, invoice_snapshot_json, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, created_at) VALUES (?, ?, ?, ?, 'LEGACY-C5', 0, 'ISSUED', 'Test', 'Test', '+910000000000', 'KL-LEG', 10000, 3000, 7000, 0, 0, 7000, 0, 7000, 'INR', 'PENDING', 'not valid json', 0, 0, 0, 0, ?)`,
    ).bind(invoiceId, ORG, BRANCH, jobId, timestamp).run();

    const invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(0);
    expect(invoice.discount_minor).toBe(3000);
  });

  it("D. mutable wash-job does not change invoice response", async () => {
    const s = nextSeq();
    const jobId = `job-disc-mutable-${s}`;
    await createJobAndItem(jobId, 1000);

    const response = await generateInvoice(jobId, idemKey(`mutable-${s}`));
    expect(response.status).toBe(201);
    const body = await response.json<{ data: Record<string, unknown> }>();
    const invoiceId = body.data.id as string;

    let invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(1000);

    // total_amount_minor = subtotal_minor - total_discount_minor + tax_minor + rounding_minor = 1
    // balance_minor = max(0, total_amount_minor - paid_amount_minor + refunded_amount_minor) = 1
    await env.DB.prepare(
      "UPDATE wash_jobs SET total_discount_minor = 9999, coupon_discount_minor = 9999, total_amount_minor = 1, taxable_amount_minor = 1, balance_minor = 1 WHERE id = ?",
    ).bind(jobId).run();

    invoice = await getInvoiceById(invoiceId);
    expect(invoice.coupon_discount_minor).toBe(1000);
    expect(invoice.discount_minor).toBe(1000);
    expect(invoice.discount_minor).not.toBe(9999);
  });
});

describe("invoice revision discount breakdown", () => {
  async function createRevision(invoiceId: string, key: string): Promise<Response> {
    return await app.request(
      `/api/v1/invoices/${invoiceId}/revisions`,
      {
        body: JSON.stringify({
          customerName: "Revised Customer",
          idempotencyKey: key,
          reason: "Testing discount copy in revision",
        }),
        headers: {
          "content-type": "application/json",
          cookie: `__Host-washpro_session=${rawToken}`,
          origin: "https://washpro.test",
          "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
        },
        method: "POST",
      },
      env,
    );
  }

  it("copies all discount-breakdown columns and rounding_minor", async () => {
    const s = nextSeq();
    const jobId = `job-disc-rev-${s}`;
    await createJobAndItem(jobId, 500, 1000, 250, 750);

    const response = await generateInvoice(jobId, idemKey(`rev-orig-${s}`));
    expect(response.status).toBe(201);
    const body = await response.json<{ data: Record<string, unknown> }>();
    const origId = body.data.id as string;

    const revResponse = await createRevision(origId, idemKey(`rev-copy-${s}`));
    expect(revResponse.status).toBe(201);
    const revBody = await revResponse.json<{ data: Record<string, unknown> }>();

    expect(revBody.data.coupon_discount_minor).toBe(500);
    expect(revBody.data.referral_discount_minor).toBe(1000);
    expect(revBody.data.reward_discount_minor).toBe(250);
    expect(revBody.data.manual_discount_minor).toBe(750);
    expect(revBody.data.rounding_minor).toBe(0);
    expect(revBody.data.discount_minor).toBe(2500);

    const orig = await getInvoiceById(origId);
    expect(orig.coupon_discount_minor).toBe(500);
    expect(orig.referral_discount_minor).toBe(1000);
  });
});

describe("PDF and share message", () => {
  it("generates PDF for new invoice with categorized discounts", async () => {
    const s = nextSeq();
    const jobId = `job-disc-pdf-${s}`;
    await createJobAndItem(jobId, 1500);

    const response = await generateInvoice(jobId, idemKey(`pdf-${s}`));
    expect(response.status).toBe(201);
    const body = await response.json<{ data: Record<string, unknown> }>();

    const pdfResponse = await app.request(
      `/api/v1/invoices/${body.data.id}/pdf`,
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("content-type")).toContain("application/pdf");
    expect(
      new TextDecoder().decode((await pdfResponse.arrayBuffer()).slice(0, 4)),
    ).toBe("%PDF");
  });

  it("legacy invoice without PDF asset returns 404 (not crash)", async () => {
    const jobId = `job-legacy-pdf-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-pdf-${nextSeq()}`;
    const snap = JSON.stringify({ discountMinor: 2000, items: [{ name: "Test" }] });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-PDF", 10000, 2000, snap);

    const pdfResponse = await app.request(
      `/api/v1/invoices/${invoiceId}/pdf`,
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(pdfResponse.status).toBe(404);
  });

  it("share message includes categorized discount lines for new invoices", async () => {
    const s = nextSeq();
    const jobId = `job-disc-share-${s}`;
    await createJobAndItem(jobId, 1000, 500);

    const response = await generateInvoice(jobId, idemKey(`share-${s}`));
    expect(response.status).toBe(201);
    const body = await response.json<{ data: Record<string, unknown> }>();
    const invoiceId = body.data.id as string;
    const invoiceNumber = body.data.invoice_number as string;

    const shareResponse = await app.request(
      `/api/v1/invoices/${invoiceId}/share-message`,
      {
        headers: {
          "content-type": "application/json",
          cookie: `__Host-washpro_session=${rawToken}`,
          origin: "https://washpro.test",
          "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
        },
        method: "POST",
      },
      env,
    );
    expect(shareResponse.status).toBe(200);
    const shareBody = await shareResponse.json<{ data: { message: string } }>();

    expect(shareBody.data.message).toContain(invoiceNumber);
    expect(shareBody.data.message).toContain("Coupon discount");
    expect(shareBody.data.message).toContain("Referral discount");
    expect(shareBody.data.message).not.toContain("Reward discount");
    expect(shareBody.data.message).not.toContain("Manual discount");
    expect(shareBody.data.message).toContain("Subtotal");
  });

  it("DB CHECK prevents inconsistent discount totals — defense-in-depth", async () => {
    const s = nextSeq();
    const jobId = `job-db-check-${s}`;
    await createJobAndItem(jobId, 1000);

    const before = await env.DB.prepare("SELECT total_discount_minor FROM wash_jobs WHERE id = ?").bind(jobId).first<{ total_discount_minor: number }>();
    expect(before!.total_discount_minor).toBe(1000);

    await expect(
      env.DB.prepare("UPDATE wash_jobs SET total_discount_minor = 9999 WHERE id = ?").bind(jobId).run(),
    ).rejects.toThrow("CHECK");

    const after = await env.DB.prepare("SELECT total_discount_minor FROM wash_jobs WHERE id = ?").bind(jobId).first<{ total_discount_minor: number }>();
    expect(after!.total_discount_minor).toBe(1000);
  });

  it("share message has no discount lines for legacy combined-only", async () => {
    const jobId = `job-legacy-share-${nextSeq()}`;
    await seedJob(jobId);
    const invoiceId = `inv-legacy-share-${nextSeq()}`;
    const snap = JSON.stringify({ discountMinor: 2000, items: [{ name: "Test" }] });
    await insertLegacyInvoice(invoiceId, jobId, "LEGACY-SHARE", 10000, 2000, snap);

    const shareResponse = await app.request(
      `/api/v1/invoices/${invoiceId}/share-message`,
      {
        headers: {
          "content-type": "application/json",
          cookie: `__Host-washpro_session=${rawToken}`,
          origin: "https://washpro.test",
          "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
        },
        method: "POST",
      },
      env,
    );
    expect(shareResponse.status).toBe(200);
    const shareBody = await shareResponse.json<{ data: { message: string } }>();
    expect(shareBody.data.message).not.toContain("Coupon discount");
    expect(shareBody.data.message).not.toContain("Referral discount");
    expect(shareBody.data.message).not.toContain("Reward discount");
    expect(shareBody.data.message).not.toContain("Manual discount");
  });
});
