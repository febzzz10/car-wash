import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "invoice-test-session-token";
const timestamp = "2026-07-23T15:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, created_at, updated_at) VALUES ('org-invoice', 'WashPro Services Pvt Ltd', 'WashPro', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES ('branch-invoice', 'org-invoice', 'MAIN', 'Main', '1 Water Road', 'Kochi', 'Kerala', '+919999999999', '+919999999999', 'hello@washpro.test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-invoice', 'org-invoice', 'branch-invoice', 'Invoice Admin', 'invoice-admin', 'invoice-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-invoice', 'org-invoice', 'admin-invoice', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, email, address, registered_at, created_at, updated_at) VALUES ('customer-invoice', 'org-invoice', 'Meera Shah', 'meera shah', '9876500000', '+919876500000', 'meera@example.com', 'Kochi', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('type-invoice', 'org-invoice', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-invoice', 'org-invoice', 'customer-invoice', 'type-invoice', 'KL 01 AA 1000', 'KL01AA1000', 'Tata', 'Nexon', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, created_at, updated_at) VALUES ('service-invoice', 'org-invoice', 'FULL', 'Full Wash', 'PRIMARY', 10000, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, status, payment_status, subtotal_minor, total_discount_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES ('job-invoice', 'org-invoice', 'branch-invoice', 'WJ-2026-000001', 'customer-invoice', 'vehicle-invoice', 'admin-invoice', 'Meera Shah', '9876500000', 'KL 01 AA 1000', 'Four Wheeler', 'Tata', 'Nexon', 'COMPLETED', 'PENDING', 10000, 0, 10000, 1800, 11800, 0, 0, 11800, 1800, '2026-07-23T10:00:00.000Z', '2026-07-23T10:30:00.000Z', 1800, 1, 1, 'AT_BUSINESS_LOCATION', 'admin-invoice', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, display_order, created_at) VALUES ('item-invoice', 'job-invoice', 'service-invoice', 'PRIMARY', 'FULL', 'Full Wash', 1, 10000, 10000, 0, 10000, 1800, 1800, 11800, 0, ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO referral_codes (id, organization_id, customer_id, code, code_normalized, issued_at, created_at, updated_at) VALUES ('refcode-invoice', 'org-invoice', 'customer-invoice', 'MEERA123', 'MEERA123', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('invoice-prefix-setting', 'org-invoice', 'invoice.prefix', 'STRING', 'WP', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('invoice-footer-setting', 'org-invoice', 'invoice.footer', 'STRING', 'Thank you for choosing WashPro.', ?)",
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

describe("immutable invoices", () => {
  it("generates one PDF snapshot, replays safely, and exposes honest WhatsApp fallbacks", async () => {
    const requestHeaders = await headers();
    const generated = await app.request(
      "/api/v1/wash-jobs/job-invoice/invoice",
      {
        body: JSON.stringify({ idempotencyKey: "invoice-key-00000001" }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(generated.status).toBe(201);
    const body = await generated.json<{
      data: { id: string; invoice_number: string; publicToken: string };
    }>();
    expect(body.data.invoice_number).toBe("WP-2026-000001");

    const retry = await app.request(
      "/api/v1/wash-jobs/job-invoice/invoice",
      {
        body: JSON.stringify({ idempotencyKey: "invoice-key-00000001" }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(retry.status).toBe(200);
    expect((await retry.json<{ data: { id: string } }>()).data.id).toBe(
      body.data.id,
    );
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM invoices WHERE wash_job_id = 'job-invoice'",
      ).first("count"),
    ).toBe(1);

    const pdf = await app.request(
      `/api/v1/invoices/${body.data.id}/pdf`,
      { headers: { cookie: requestHeaders["cookie"] ?? "" } },
      env,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(
      new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 4)),
    ).toBe("%PDF");

    const publicPdf = await app.request(
      `/invoice/${body.data.publicToken}`,
      {},
      env,
    );
    expect(publicPdf.status).toBe(200);

    const share = await app.request(
      `/api/v1/invoices/${body.data.id}/share-message`,
      { headers: requestHeaders, method: "POST" },
      env,
    );
    expect(share.status).toBe(200);
    const shareBody = await share.json<{
      data: {
        copyLink: string;
        copyMessage: string;
        downloadPdfAvailable: boolean;
        message: string;
        secureLink: string;
        whatsappUrl: string;
      };
    }>();
    expect(shareBody.data.downloadPdfAvailable).toBe(true);
    expect(shareBody.data.message).toContain("WP-2026-000001");
    expect(shareBody.data.message).not.toContain(shareBody.data.secureLink);
    expect(shareBody.data.message).not.toContain("/invoice/");
    expect(shareBody.data.copyMessage).toBe(shareBody.data.message);
    expect(shareBody.data.copyMessage).not.toContain("/invoice/");
    expect(shareBody.data.copyLink).toBe(shareBody.data.secureLink);
    expect(shareBody.data.secureLink).toContain("/invoice/");
    expect(shareBody.data.whatsappUrl).toContain("wa.me");
    expect(shareBody.data.whatsappUrl).not.toContain("/invoice/");
    expect(shareBody.data.message.toLowerCase()).not.toContain("attached pdf");

    const revision = await app.request(
      `/api/v1/invoices/${body.data.id}/revisions`,
      {
        body: JSON.stringify({
          customerName: "Meera S. Shah",
          idempotencyKey: "invoice-revision-key-01",
          reason: "Correct customer display name",
        }),
        headers: requestHeaders,
        method: "POST",
      },
      env,
    );
    expect(revision.status).toBe(201);
    expect(await revision.json()).toMatchObject({
      data: { customer_name_snapshot: "Meera S. Shah", revision_number: 1 },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM invoices WHERE wash_job_id = 'job-invoice'",
      ).first("count"),
    ).toBe(2);
    expect(
      await env.DB.prepare(
        "SELECT customer_name_snapshot FROM invoices WHERE id = ?",
      )
        .bind(body.data.id)
        .first("customer_name_snapshot"),
    ).toBe("Meera Shah");

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2100-01-01T00:00:00.000Z"));
      const expiredLink = await app.request(
        `/invoice/${body.data.publicToken}`,
        {},
        env,
      );
      expect(expiredLink.status).toBe(410);
      expect(await expiredLink.json()).toMatchObject({
        error: { code: "INVOICE_TOKEN_EXPIRED" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("invoice share message — link-free WhatsApp text", () => {
  async function generateInvoice(
    idempotencyKey: string,
    jobId = "job-invoice",
  ): Promise<string> {
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

  async function fetchShareMessage(invoiceId: string): Promise<{
    copyLink: string;
    copyMessage: string;
    message: string;
    secureLink: string;
    whatsappUrl: string;
  }> {
    const requestHeaders = await headers();
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/share-message`,
      { headers: requestHeaders, method: "POST" },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: {
        copyLink: string;
        copyMessage: string;
        message: string;
        secureLink: string;
        whatsappUrl: string;
      };
    }>();
    return body.data;
  }

  it("builds a link-free WhatsApp message with all required fields", async () => {
    const invoiceId = await generateInvoice("invoice-key-share-content-01");
    const data = await fetchShareMessage(invoiceId);

    expect(data.message).toContain("Hi Meera Shah,");
    expect(data.message).toContain("Your WashPro invoice WP-2026-000001 is ready.");
    expect(data.message).toContain("Vehicle: KL 01 AA 1000");
    expect(data.message).toContain("Service: Full Wash");
    expect(data.message).toContain("Amount: INR 118.00");
    expect(data.message).toContain("Payment status: PENDING");

    expect(data.message).not.toContain("Secure invoice:");
    expect(data.message).not.toContain("/invoice/");
    expect(data.message).not.toContain("undefined");
    expect(data.message).not.toContain("null");

    expect(data.copyMessage).toBe(data.message);
    expect(data.copyLink).toBe(data.secureLink);
    expect(data.secureLink).toContain("/invoice/");
  });

  it("includes the referral-code line when the invoice has one", async () => {
    const invoiceId = await generateInvoice("invoice-key-share-ref-01");

    const data = await fetchShareMessage(invoiceId);

    expect(data.message).toContain("Referral code: MEERA123");
    expect(data.message.split("\n").at(-1)).toBe("Referral code: MEERA123");
    expect(data.message).not.toContain("/invoice/");
  });

  it("omits the referral-code line when the invoice has none", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, email, address, registered_at, created_at, updated_at) VALUES ('customer-noref', 'org-invoice', 'Ravi Kumar', 'ravi kumar', '9876511111', '+919876511111', 'ravi@example.com', 'Ernakulam', ?, ?, ?)",
      ).bind(timestamp, timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-noref', 'org-invoice', 'customer-noref', 'type-invoice', 'KL 02 BB 2000', 'KL02BB2000', 'Maruti', 'Swift', ?, ?)",
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, status, payment_status, subtotal_minor, total_discount_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES ('job-noref', 'org-invoice', 'branch-invoice', 'WJ-2026-000002', 'customer-noref', 'vehicle-noref', 'admin-invoice', 'Ravi Kumar', '9876511111', 'KL 02 BB 2000', 'Four Wheeler', 'Maruti', 'Swift', 'COMPLETED', 'PENDING', 10000, 0, 10000, 1800, 11800, 0, 0, 11800, 1800, '2026-07-23T10:00:00.000Z', '2026-07-23T10:30:00.000Z', 1800, 1, 1, 'AT_BUSINESS_LOCATION', 'admin-invoice', ?, ?)`,
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        "INSERT OR IGNORE INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, display_order, created_at) VALUES ('item-noref', 'job-noref', 'service-invoice', 'PRIMARY', 'FULL', 'Full Wash', 1, 10000, 10000, 0, 10000, 1800, 1800, 11800, 0, ?)",
      ).bind(timestamp),
    ]);

    const invoiceId = await generateInvoice(
      "invoice-key-share-noref-01",
      "job-noref",
    );

    const data = await fetchShareMessage(invoiceId);

    expect(data.message).not.toContain("Referral code:");
    expect(data.message).not.toContain("undefined");
    expect(data.message).not.toContain("null");
    expect(data.message.split("\n").at(-1)).toBe("Payment status: PENDING");
  });

  it("produces a stable message across repeated calls", async () => {
    const invoiceId = await generateInvoice("invoice-key-share-safe-01");

    const first = await fetchShareMessage(invoiceId);
    const second = await fetchShareMessage(invoiceId);

    expect(second.message).toBe(first.message);
    expect(second.message).not.toContain("/invoice/");
  });
});