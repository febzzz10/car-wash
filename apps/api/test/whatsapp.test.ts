import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
} from "../src/services/whatsapp";

const rawToken = "whatsapp-test-session-token";
const staffRawToken = "whatsapp-staff-session-token";
const staffSendRawToken = "whatsapp-staff-send-session-token";
const timestamp = "2026-08-01T15:00:00.000Z";

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const staffTokenHash = await hashSessionToken(
    staffRawToken,
    env.SESSION_PEPPER,
  );
  const staffSendTokenHash = await hashSessionToken(
    staffSendRawToken,
    env.SESSION_PEPPER,
  );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, created_at, updated_at) VALUES ('org-wa', 'WashPro Services Pvt Ltd', 'WashPro', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES ('branch-wa', 'org-wa', 'MAIN', 'Main', '1 Water Road', 'Kochi', 'Kerala', '+919999999999', '+919999999999', 'hello@washpro.test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-wa', 'org-wa', 'branch-wa', 'Wa Admin', 'wa-admin', 'wa-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-wa', 'org-wa', 'branch-wa', 'Wa Staff', 'wa-staff', 'wa-staff', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-wa-send', 'org-wa', 'branch-wa', 'Wa Staff Send', 'wa-staff-send', 'wa-staff-send', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\",\"invoices.send\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wa', 'org-wa', 'admin-wa', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wa-staff', 'org-wa', 'staff-wa', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wa-staff-send', 'org-wa', 'staff-wa-send', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffSendTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('type-wa', 'org-wa', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, created_at, updated_at) VALUES ('service-wa', 'org-wa', 'FULL', 'Full Wash', 'PRIMARY', 10000, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('wa-prefix-setting', 'org-wa', 'invoice.prefix', 'STRING', 'WP', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('wa-name-setting', 'org-wa', 'business.name', 'STRING', 'WashPro Test Co.', ?)",
    ).bind(timestamp),
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

async function staffHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${staffRawToken}`,
    origin: "https://washpro.test",
  };
}

async function staffSendHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${staffSendRawToken}`,
    origin: "https://washpro.test",
  };
}

async function createCustomerJob(customerId: string): Promise<{
  jobId: string;
  registration: string;
}> {
  const s = nextSeq();
  const vehicleId = `vehicle-wa-${customerId}`;
  const jobId = `job-wa-${customerId}`;
  const registration = `KL 01 AA 10${s}`;
  const customerPhone = `987650${String(s).padStart(4, "0")}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, email, address, registered_at, created_at, updated_at) VALUES ('${customerId}', 'org-wa', 'Meera Shah', 'meera shah', '${customerPhone}', '+91${customerPhone}', 'meera-wa${s}@example.com', 'Kochi', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('${vehicleId}', 'org-wa', '${customerId}', 'type-wa', '${registration}', '${registration.replaceAll(" ", "")}', 'Tata', 'Nexon', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, status, payment_status, subtotal_minor, total_discount_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES ('${jobId}', 'org-wa', 'branch-wa', 'WJ-2026-${String(s).padStart(6, "0")}', '${customerId}', '${vehicleId}', 'admin-wa', 'Meera Shah', '9876500000', '${registration}', 'Four Wheeler', 'Tata', 'Nexon', 'COMPLETED', 'PENDING', 10000, 0, 10000, 1800, 11800, 0, 0, 11800, 1800, '2026-08-01T10:00:00.000Z', '2026-08-01T10:30:00.000Z', 1800, 1, 1, 'AT_BUSINESS_LOCATION', 'admin-wa', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, display_order, created_at) VALUES ('item-wa-${customerId}', '${jobId}', 'service-wa', 'PRIMARY', 'FULL', 'Full Wash', 1, 10000, 10000, 0, 10000, 1800, 1800, 11800, 0, ?)`,
    ).bind(timestamp),
  ]);
  return { jobId, registration };
}

async function generateInvoice(jobId: string, idempotencyKey: string) {
  const requestHeaders = await headers();
  const generated = await app.request(
    `/api/v1/wash-jobs/${jobId}/invoice`,
    {
      body: JSON.stringify({ idempotencyKey }),
      headers: requestHeaders,
      method: "POST",
    },
    env,
  );
  expect([200, 201]).toContain(generated.status);
  const body = await generated.json<{ data: { id: string } }>();
  return body.data.id;
}

async function whatsappAction(
  invoiceId: string,
  requestHeaders: Record<string, string>,
): Promise<Response> {
  return app.request(
    `/api/v1/invoices/${invoiceId}/whatsapp-action`,
    { headers: requestHeaders },
    env,
  );
}

describe("buildWhatsAppMessage", () => {
  it("builds the full message with referral code for a paid invoice", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "INR",
      customerName: "Meera Shah",
      paymentStatus: "PAID",
      referralCode: "WP8A92B9E0",
      serviceName: "Full Wash",
      totalMinor: 80000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).toBe(
      [
        "Hi Meera Shah 👋",
        "Thank you for choosing WashPro! 🚗✨",
        "",
        "Your Full Wash for vehicle KL02GD2009 is complete.",
        "Amount: ₹800.00",
        "Payment: PAID ✅",
        "Referral code: WP8A92B9E0",
        "",
        "Thanks for visiting WashPro. See you again! 😊",
      ].join("\n"),
    );
  });

  it("omits the referral code line when the invoice has none", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "INR",
      customerName: "Meera Shah",
      paymentStatus: "PENDING",
      referralCode: null,
      serviceName: "Full Wash",
      totalMinor: 80000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).not.toContain("Referral code:");
  });

  it("omits the referral code line when it is blank", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "INR",
      customerName: "Meera Shah",
      paymentStatus: "PENDING",
      referralCode: "   ",
      serviceName: "Full Wash",
      totalMinor: 80000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).not.toContain("Referral code:");
  });

  it("does not append the checkmark for unpaid invoices", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "INR",
      customerName: "Meera Shah",
      paymentStatus: "PENDING",
      referralCode: null,
      serviceName: "Full Wash",
      totalMinor: 80000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).toContain("Payment: PENDING");
    expect(message).not.toContain("✅");
  });

  it("falls back to 'Car wash' when the service name is missing", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "INR",
      customerName: "Meera Shah",
      paymentStatus: "PAID",
      referralCode: null,
      serviceName: "",
      totalMinor: 80000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).toContain(
      "Your Car wash for vehicle KL02GD2009 is complete.",
    );
  });

  it("uses the currency symbol only for INR", () => {
    const message = buildWhatsAppMessage({
      currencyCode: "USD",
      customerName: "Meera Shah",
      paymentStatus: "PAID",
      referralCode: null,
      serviceName: "Full Wash",
      totalMinor: 12000,
      vehicleRegistration: "KL02GD2009",
    });
    expect(message).toContain("Amount: USD 120.00");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me URL with digits-only phone and encoded message", () => {
    const message = "Hi Meera 👋";
    expect(buildWhatsAppUrl("+91 98765 00000", message)).toBe(
      `https://wa.me/919876500000?text=${encodeURIComponent(message)}`,
    );
  });

  it("adds the default country code for a 10-digit number", () => {
    expect(buildWhatsAppUrl("9876500000", "Hi")).toBe(
      "https://wa.me/919876500000?text=Hi",
    );
  });

  it("returns null for an invalid phone", () => {
    expect(buildWhatsAppUrl("not-a-number", "Hi")).toBeNull();
  });
});

describe("GET /api/v1/invoices/:id/whatsapp-action (route wiring)", () => {
  it("lets an ADMIN open WhatsApp with the full pre-filled message", async () => {
    const { jobId, registration } = await createCustomerJob("customer-wa-main");
    const invoiceId = await generateInvoice(jobId, "wa-gen-main-00001");
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { whatsappUrl: string | null };
    }>();
    expect(body).toEqual({
      success: true,
      data: { whatsappUrl: expect.any(String) },
    });
    const url = body.data.whatsappUrl!;
    expect(url).toMatch(/^https:\/\/wa\.me\/919876500000\?text=/u);
    const text = decodeURIComponent(url.split("?text=")[1]!);
    expect(text).toBe(
      [
        "Hi Meera Shah 👋",
        "Thank you for choosing WashPro! 🚗✨",
        "",
        `Your Full Wash for vehicle ${registration} is complete.`,
        "Amount: ₹118.00",
        "Payment: PENDING",
        "",
        "Thanks for visiting WashPro. See you again! 😊",
      ].join("\n"),
    );
    expect(text).not.toContain("/invoice/");
    expect(text).not.toContain("http");
    expect(text).not.toContain(".pdf");
  });

  it("lets a STAFF user with the invoices.send permission open WhatsApp", async () => {
    const { jobId, registration } = await createCustomerJob(
      "customer-wa-staffsend",
    );
    const invoiceId = await generateInvoice(jobId, "wa-gen-staffsend-00001");
    const response = await whatsappAction(invoiceId, await staffSendHeaders());
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { whatsappUrl: string | null };
    }>();
    expect(body).toEqual({
      success: true,
      data: { whatsappUrl: expect.any(String) },
    });
    const url = body.data.whatsappUrl!;
    expect(url).toMatch(/^https:\/\/wa\.me\/919876500000\?text=/u);
    const text = decodeURIComponent(url.split("?text=")[1]!);
    expect(text).toBe(
      [
        "Hi Meera Shah 👋",
        "Thank you for choosing WashPro! 🚗✨",
        "",
        `Your Full Wash for vehicle ${registration} is complete.`,
        "Amount: ₹118.00",
        "Payment: PENDING",
        "",
        "Thanks for visiting WashPro. See you again! 😊",
      ].join("\n"),
    );
    expect(text).not.toContain("/invoice/");
  });

  it("never returns the phone as a standalone response field", async () => {
    const { jobId } = await createCustomerJob("customer-wa-privacy");
    const invoiceId = await generateInvoice(jobId, "wa-gen-privacy-0001");
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    const text = await response.text();
    expect(text).not.toContain("+91");
    expect(text).not.toContain("customer_phone_snapshot");
    expect(text).not.toContain("Meera Shah");
    expect(text).not.toContain('"phone"');
    expect(text).toMatch(/wa\.me\/919876500000\?text=/u);
  });

  it("includes the referral code line when the invoice has one", async () => {
    const { jobId } = await createCustomerJob("customer-wa-referral");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO referral_codes (id, organization_id, customer_id, code, code_normalized, status, issued_at, created_at, updated_at) VALUES ('refcode-wa-1', 'org-wa', 'customer-wa-referral', 'WP8A92B9E0', 'WP8A92B9E0', 'ACTIVE', ?, ?, ?)",
    )
      .bind(timestamp, timestamp, timestamp)
      .run();
    const invoiceId = await generateInvoice(jobId, "wa-gen-referral-0001");
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    const body = await response.json<{ data: { whatsappUrl: string } }>();
    const text = decodeURIComponent(body.data.whatsappUrl.split("?text=")[1]!);
    expect(text).toContain("Referral code: WP8A92B9E0");
  });

  it("uses 'Payment: PAID ✅' for a paid invoice", async () => {
    const { jobId } = await createCustomerJob("customer-wa-paid");
    await env.DB.prepare(
      "UPDATE wash_jobs SET payment_status = 'PAID', paid_amount_minor = 11800, balance_minor = 0 WHERE id = ?",
    )
      .bind(jobId)
      .run();
    const invoiceId = await generateInvoice(jobId, "wa-gen-paid-00001");
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    const body = await response.json<{ data: { whatsappUrl: string } }>();
    const text = decodeURIComponent(body.data.whatsappUrl.split("?text=")[1]!);
    expect(text).toContain("Payment: PAID ✅");
  });

  it("returns whatsappUrl null when the snapshot phone is invalid", async () => {
    const { jobId } = await createCustomerJob("customer-wa-nophone");
    await env.DB.prepare(
      "UPDATE wash_jobs SET customer_phone_snapshot = 'not-a-number' WHERE id = ?",
    )
      .bind(jobId)
      .run();
    const invoiceId = await generateInvoice(jobId, "wa-gen-nophone-0001");
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: { whatsappUrl: string | null };
    }>();
    expect(body).toEqual({ success: true, data: { whatsappUrl: null } });
  });

  it("returns 404 for an unknown invoice", async () => {
    const response = await whatsappAction("no-such-invoice", {
      cookie: `__Host-washpro_session=${rawToken}`,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 404 for an invoice outside the caller's organization", async () => {
    const { jobId } = await createCustomerJob("customer-wa-otherorg");
    const invoiceId = await generateInvoice(jobId, "wa-gen-otherorg-001");
    const otherTokenHash = await hashSessionToken(
      "whatsapp-other-org-token",
      env.SESSION_PEPPER,
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, created_at, updated_at) VALUES ('org-wa-other', 'Other Org Pvt Ltd', 'Other Org', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES ('branch-wa-other', 'org-wa-other', 'MAIN', 'Main', '2 Other Road', 'Kochi', 'Kerala', '+919999999998', '+919999999998', 'other@washpro.test', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-wa-other', 'org-wa-other', 'branch-wa-other', 'Other Admin', 'other-admin', 'other-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wa-other', 'org-wa-other', 'admin-wa-other', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
      ).bind(otherTokenHash, timestamp, timestamp),
    ]);
    const response = await whatsappAction(invoiceId, {
      cookie: `__Host-washpro_session=whatsapp-other-org-token`,
    });
    expect(response.status).toBe(404);
  });

  it("returns 403 for staff without the invoices.send permission", async () => {
    const { jobId } = await createCustomerJob("customer-wa-staff");
    const invoiceId = await generateInvoice(jobId, "wa-gen-staff-00001");
    const response = await whatsappAction(invoiceId, await staffHeaders());
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain("9876500000");
    expect(text).not.toContain("Meera");
    expect(text).not.toContain("whatsappUrl");
  });

  it("returns 401 without a session", async () => {
    const response = await whatsappAction("whatever", {});
    expect(response.status).toBe(401);
  });
});
