import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app";
import {
  createCsrfToken,
  hashSessionToken,
  sha256,
} from "../src/security/tokens";
import type { InvoiceEmailInput } from "../src/services/gmail";
import { GmailError } from "../src/services/gmail";
import { sendInvoiceEmailForInvoice } from "../src/services/invoice-email";
import type { InvoiceEmailDeps } from "../src/services/invoice-email";
import type { AuthContext } from "../src/types";

const rawToken = "invoice-email-test-session-token";
const staffRawToken = "invoice-email-staff-session-token";
const staffSendRawToken = "invoice-email-staff-send-session-token";
const otherOrgRawToken = "invoice-email-other-org-session-token";
const timestamp = "2026-08-01T15:00:00.000Z";
const requestId = "test-request-id";

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u;

const auth: AuthContext = {
  branchId: "branch-email",
  organizationId: "org-email",
  permissions: ["invoices.send"],
  role: "ADMIN",
  sessionId: "session-email",
  userId: "admin-email",
  userName: "Email Admin",
};

const staffSendAuth: AuthContext = {
  branchId: "branch-email",
  organizationId: "org-email",
  permissions: ["wash_jobs.create", "invoices.send"],
  role: "STAFF",
  sessionId: "session-email-staff-send",
  userId: "staff-email-send",
  userName: "Email Staff Send",
};

function makeDeps(): {
  build: ReturnType<typeof vi.fn<InvoiceEmailDeps["buildInvoiceEmail"]>>;
  deps: InvoiceEmailDeps;
  send: ReturnType<typeof vi.fn<InvoiceEmailDeps["sendInvoiceEmail"]>>;
} {
  const build = vi.fn((input: InvoiceEmailInput) => ({
    attachmentFilename: `WashPro-${input.invoiceNumber}.pdf`,
    subject: `Your WashPro Invoice \u2013 ${input.invoiceNumber}`,
    text: `Hi ${input.customerName},`,
  }));
  const send = vi.fn(async () => ({
    messageId: "msg-test-1",
    sentAt: "2026-08-01T16:00:00.000Z",
  }));
  return {
    build,
    deps: {
      GmailError,
      buildInvoiceEmail: build,
      isValidEmail: (value) => emailPattern.test(value),
      sendInvoiceEmail: send,
    },
    send,
  };
}

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
  const otherOrgTokenHash = await hashSessionToken(
    otherOrgRawToken,
    env.SESSION_PEPPER,
  );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, created_at, updated_at) VALUES ('org-email', 'WashPro Services Pvt Ltd', 'WashPro', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES ('branch-email', 'org-email', 'MAIN', 'Main', '1 Water Road', 'Kochi', 'Kerala', '+919999999999', '+919999999999', 'hello@washpro.test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-email', 'org-email', 'branch-email', 'Email Admin', 'email-admin', 'email-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-email', 'org-email', 'branch-email', 'Email Staff', 'email-staff', 'email-staff', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-email-send', 'org-email', 'branch-email', 'Email Staff Send', 'email-staff-send', 'email-staff-send', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\",\"invoices.send\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, legal_name, display_name, created_at, updated_at) VALUES ('org-email-other', 'Other Org Pvt Ltd', 'Other Org', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, address_line_1, city, state, phone, whatsapp_number, email, created_at, updated_at) VALUES ('branch-email-other', 'org-email-other', 'MAIN', 'Main', '2 Other Road', 'Kochi', 'Kerala', '+919999999998', '+919999999998', 'other@washpro.test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('admin-email-other', 'org-email-other', 'branch-email-other', 'Other Org Admin', 'other-org-admin', 'other-org-admin', 'unused', 'ADMIN', 'ACTIVE', '[]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-email', 'org-email', 'admin-email', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-email-staff', 'org-email', 'staff-email', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-email-staff-send', 'org-email', 'staff-email-send', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffSendTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-email-other', 'org-email-other', 'admin-email-other', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(otherOrgTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('type-email', 'org-email', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, created_at, updated_at) VALUES ('service-email', 'org-email', 'FULL', 'Full Wash', 'PRIMARY', 10000, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('email-prefix-setting', 'org-email', 'invoice.prefix', 'STRING', 'WP', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('email-name-setting', 'org-email', 'business.name', 'STRING', 'WashPro Test Co.', ?)",
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
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${staffRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(staffRawToken, env.CSRF_SECRET),
  };
}

async function staffSendHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${staffSendRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(staffSendRawToken, env.CSRF_SECRET),
  };
}

async function otherOrgHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${otherOrgRawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(otherOrgRawToken, env.CSRF_SECRET),
  };
}

async function createCustomerJob(
  customerId: string,
  email: string | null,
): Promise<{
  jobId: string;
  registration: string;
  customerEmail: string | null;
}> {
  const s = nextSeq();
  const vehicleId = `vehicle-email-${customerId}`;
  const jobId = `job-email-${customerId}`;
  const registration = `KL 01 AA 10${s}`;
  const customerEmail =
    email === null || email === "not-an-email"
      ? email
      : `meera${s}@example.com`;
  const customerEmailSql =
    customerEmail === null ? "NULL" : `'${customerEmail}'`;
  const phone = `987650${String(s).padStart(4, "0")}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO customers (id, organization_id, full_name, name_search, phone, phone_normalized, email, address, registered_at, created_at, updated_at) VALUES ('${customerId}', 'org-email', 'Meera Shah', 'meera shah', '${phone}', '+91${phone}', ${customerEmailSql}, 'Kochi', ?, ?, ?)`,
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('${vehicleId}', 'org-email', '${customerId}', 'type-email', '${registration}', '${registration.replaceAll(" ", "")}', 'Tata', 'Nexon', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, status, payment_status, subtotal_minor, total_discount_minor, taxable_amount_minor, tax_minor, total_amount_minor, paid_amount_minor, refunded_amount_minor, balance_minor, tax_rate_basis_points, started_at, completed_at, total_active_seconds, mandatory_photo_verified, mandatory_location_verified, business_location_status, created_by_user_id, created_at, updated_at) VALUES ('${jobId}', 'org-email', 'branch-email', 'WJ-2026-${String(s).padStart(6, "0")}', '${customerId}', '${vehicleId}', 'admin-email', 'Meera Shah', '9876500000', '${registration}', 'Four Wheeler', 'Tata', 'Nexon', 'COMPLETED', 'PENDING', 10000, 0, 10000, 1800, 11800, 0, 0, 11800, 1800, '2026-08-01T10:00:00.000Z', '2026-08-01T10:30:00.000Z', 1800, 1, 1, 'AT_BUSINESS_LOCATION', 'admin-email', ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, display_order, created_at) VALUES ('item-email-${customerId}', '${jobId}', 'service-email', 'PRIMARY', 'FULL', 'Full Wash', 1, 10000, 10000, 0, 10000, 1800, 1800, 11800, 0, ?)`,
    ).bind(timestamp),
  ]);
  return { jobId, registration, customerEmail };
}

async function generateInvoice(
  jobId: string,
  idempotencyKey: string,
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

describe("sendInvoiceEmailForInvoice (send-email operation)", () => {
  it("sends the stored invoice PDF to the customer email and records audit + idempotency", async () => {
    const { jobId, customerEmail } = await createCustomerJob(
      "customer-email-main",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-main-gen-00001");
    const invoiceNumber = (await env.DB.prepare(
      "SELECT invoice_number FROM invoices WHERE id = ?",
    )
      .bind(invoiceId)
      .first<string>("invoice_number"))!;
    const { deps, build, send } = makeDeps();

    const result = await sendInvoiceEmailForInvoice(
      env,
      auth,
      invoiceId,
      "email-key-main-send-00001",
      requestId,
      deps,
    );

    expect(result).toEqual({
      invoiceId,
      invoiceNumber,
      recipientEmail: customerEmail,
      sentAt: "2026-08-01T16:00:00.000Z",
    });
    const resultText = JSON.stringify(result);
    expect(resultText).not.toContain("test-gmail-client-secret");
    expect(resultText).not.toContain("idempotencyKey");
    expect(resultText).not.toContain("%PDF");

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "WashPro Test Co.",
        currencyCode: "INR",
        customerEmail,
        customerName: "Meera Shah",
        invoiceNumber,
        paymentStatus: "PENDING",
        totalMinor: 11800,
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]![1]!;
    expect(sent.to).toBe(customerEmail);
    expect(sent.fromDisplayName).toBe("WashPro Test Co.");
    expect(sent.attachmentFilename).toBe(`WashPro-${invoiceNumber}.pdf`);
    expect(sent.subject).toBe(`Your WashPro Invoice \u2013 ${invoiceNumber}`);
    expect(sent.text).toBe("Hi Meera Shah,");

    const stored = await app.request(
      `/api/v1/invoices/${invoiceId}/pdf`,
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(stored.status).toBe(200);
    const storedBytes = new Uint8Array(await stored.arrayBuffer());
    expect(sent.attachmentBytes).toBeInstanceOf(Uint8Array);
    expect(sent.attachmentBytes.length).toBe(storedBytes.length);
    expect(
      (sent.attachmentBytes as Uint8Array).every(
        (byte, index) => byte === storedBytes[index],
      ),
    ).toBe(true);

    const audit = await env.DB.prepare(
      "SELECT new_value_json FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
    )
      .bind(invoiceId)
      .first<string>("new_value_json");
    const auditData = JSON.parse(audit!) as Record<string, unknown>;
    expect(auditData.recipientEmail).toBe(customerEmail);
    expect(auditData.channel).toBe("EMAIL");
    expect(auditData.attachment).toBe("PDF");
    expect(auditData.messageId).toBe("msg-test-1");
    expect(auditData.invoiceId).toBe(invoiceId);
    expect(auditData.customerId).toBe("customer-email-main");
    expect(auditData.messageId).toBe("msg-test-1");

    const auditRow = await env.DB.prepare(
      "SELECT request_id, user_id, record_type FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
    )
      .bind(invoiceId)
      .first<Record<string, unknown>>();
    expect(auditRow).toMatchObject({
      record_type: "INVOICE",
      request_id: requestId,
      user_id: "admin-email",
    });

    const keyRow = await env.DB.prepare(
      "SELECT operation_type, state, resource_id, response_status, expires_at, completed_at FROM idempotency_keys WHERE idempotency_key = ?",
    )
      .bind("email-key-main-send-00001")
      .first<Record<string, unknown>>();
    expect(keyRow).toMatchObject({
      operation_type: "INVOICE_EMAIL_SEND",
      response_status: 200,
      resource_id: invoiceId,
      state: "COMPLETED",
    });
    const expirySeconds =
      (Date.parse(String(keyRow!.expires_at)) -
        Date.parse(String(keyRow!.completed_at))) /
      1000;
    expect(expirySeconds).toBe(7200);
  });

  it("lets a STAFF user with the invoices.send permission send the invoice PDF", async () => {
    const { jobId, customerEmail } = await createCustomerJob(
      "customer-email-staffsend",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(
      jobId,
      "email-key-staffsend-gen-01",
    );
    const invoiceNumber = (await env.DB.prepare(
      "SELECT invoice_number FROM invoices WHERE id = ?",
    )
      .bind(invoiceId)
      .first<string>("invoice_number"))!;
    const { deps, send } = makeDeps();

    const result = await sendInvoiceEmailForInvoice(
      env,
      staffSendAuth,
      invoiceId,
      "email-key-staffsend-send-01",
      requestId,
      deps,
    );

    expect(result).toEqual({
      invoiceId,
      invoiceNumber,
      recipientEmail: customerEmail,
      sentAt: "2026-08-01T16:00:00.000Z",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]![1]!;
    expect(sent.attachmentFilename).toBe(`WashPro-${invoiceNumber}.pdf`);
    const stored = await app.request(
      `/api/v1/invoices/${invoiceId}/pdf`,
      { headers: { cookie: `__Host-washpro_session=${rawToken}` } },
      env,
    );
    expect(stored.status).toBe(200);
    const storedBytes = new Uint8Array(await stored.arrayBuffer());
    expect(sent.attachmentBytes).toBeInstanceOf(Uint8Array);
    expect(sent.attachmentBytes.length).toBe(storedBytes.length);
    expect(
      (sent.attachmentBytes as Uint8Array).every(
        (byte, index) => byte === storedBytes[index],
      ),
    ).toBe(true);

    const auditRow = await env.DB.prepare(
      "SELECT user_id FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
    )
      .bind(invoiceId)
      .first<Record<string, unknown>>();
    expect(auditRow).toMatchObject({ user_id: "staff-email-send" });

    const keyRow = await env.DB.prepare(
      "SELECT user_id, state FROM idempotency_keys WHERE idempotency_key = ?",
    )
      .bind("email-key-staffsend-send-01")
      .first<Record<string, unknown>>();
    expect(keyRow).toMatchObject({
      state: "COMPLETED",
      user_id: "staff-email-send",
    });
  });

  it("replays the same idempotency key without sending a second email", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-replay",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-replay-gen-01");
    const { deps, send } = makeDeps();

    const first = await sendInvoiceEmailForInvoice(
      env,
      auth,
      invoiceId,
      "email-key-replay-send-01",
      requestId,
      deps,
    );
    expect(first).toMatchObject({ invoiceId });

    const second = await sendInvoiceEmailForInvoice(
      env,
      auth,
      invoiceId,
      "email-key-replay-send-01",
      requestId,
      deps,
    );
    expect(second).toEqual({ idempotentReplay: true, invoiceId });
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
      )
        .bind(invoiceId)
        .first("count"),
    ).toBe(1);
  });

  it("rejects reuse of an idempotency key for a different invoice", async () => {
    const { jobId: firstJob } = await createCustomerJob(
      "customer-email-conflict-a",
      "meera@example.com",
    );
    const { jobId: secondJob } = await createCustomerJob(
      "customer-email-conflict-b",
      "meera@example.com",
    );
    const firstInvoice = await generateInvoice(
      firstJob,
      "email-key-conflict-gen-01",
    );
    const secondInvoice = await generateInvoice(
      secondJob,
      "email-key-conflict-gen-02",
    );
    const { deps, send } = makeDeps();

    await sendInvoiceEmailForInvoice(
      env,
      auth,
      firstInvoice,
      "email-key-conflict-send-01",
      requestId,
      deps,
    );

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        secondInvoice,
        "email-key-conflict-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown invoice", async () => {
    const { deps, send } = makeDeps();
    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        "no-such-invoice",
        "email-key-unknown-0000001",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects with CUSTOMER_EMAIL_MISSING when the customer has no email", async () => {
    const { jobId } = await createCustomerJob("customer-email-noemail", null);
    const invoiceId = await generateInvoice(jobId, "email-key-noemail-gen-01");
    const { deps, send } = makeDeps();

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-noemail-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({ code: "CUSTOMER_EMAIL_MISSING", status: 422 });
    expect(send).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
      )
        .bind(invoiceId)
        .first("count"),
    ).toBe(0);
  });

  it("rejects with VALIDATION_ERROR when the customer email is invalid", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-invalid",
      "not-an-email",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-invalid-gen-01");
    const { deps, send } = makeDeps();

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-invalid-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    expect(send).not.toHaveBeenCalled();
  });

  it("maps Gmail AUTH_FAILED to 502 EMAIL_SEND_FAILED without side effects", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-autherr",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-autherr-gen-01");
    const { deps, send } = makeDeps();
    send.mockRejectedValueOnce(new GmailError("AUTH_FAILED", "auth failed"));

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-autherr-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
      message: "The email service could not authenticate. Try again later.",
      status: 502,
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'INVOICE_EMAIL_SENT' AND record_id = ?",
      )
        .bind(invoiceId)
        .first("count"),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM idempotency_keys WHERE operation_type = 'INVOICE_EMAIL_SEND' AND resource_id = ?",
      )
        .bind(invoiceId)
        .first("count"),
    ).toBe(0);
  });

  it("maps Gmail NOT_CONFIGURED to 503 EMAIL_NOT_CONFIGURED", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-notconf",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-notconf-gen-01");
    const { deps, send } = makeDeps();
    send.mockRejectedValueOnce(
      new GmailError("NOT_CONFIGURED", "not configured"),
    );

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-notconf-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED", status: 503 });
  });

  it("maps Gmail RATE_LIMITED to 502 with the busy message", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-gmailrate",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(
      jobId,
      "email-key-gmailrate-gen-01",
    );
    const { deps, send } = makeDeps();
    send.mockRejectedValueOnce(new GmailError("RATE_LIMITED", "gmail busy"));

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-gmailrate-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
      message: "The email service is busy. Try again later.",
      status: 502,
    });
  });

  it("maps unexpected send errors to 502 EMAIL_SEND_FAILED", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-generr",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-generr-gen-01");
    const { deps, send } = makeDeps();
    send.mockRejectedValueOnce(new Error("unexpected transport error"));

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-generr-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({
      code: "EMAIL_SEND_FAILED",
      message: "The invoice email could not be sent. Try again later.",
      status: 502,
    });
  });

  it("returns 429 RATE_LIMITED when the per-user limit is exceeded", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-ratelimit",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-rate-gen-01");
    const { deps, send } = makeDeps();
    const rateKey = `invoice:email:v1:rate:${await sha256("admin-email")}`;
    await env.CACHE.put(rateKey, "1000");

    await expect(
      sendInvoiceEmailForInvoice(
        env,
        auth,
        invoiceId,
        "email-key-rate-send-01",
        requestId,
        deps,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(send).not.toHaveBeenCalled();
    await env.CACHE.delete(rateKey);
  });
});

describe("POST /api/v1/invoices/:id/send-email (route wiring)", () => {
  it("rejects requests without an idempotency key", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-nokey",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-nokey-gen-01");
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/send-email`,
      {
        body: JSON.stringify({}),
        headers: await headers(),
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 404 for an unknown invoice", async () => {
    const response = await app.request(
      "/api/v1/invoices/no-such-invoice/send-email",
      {
        body: JSON.stringify({ idempotencyKey: "email-key-unknown-0000001" }),
        headers: await headers(),
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 403 for staff without the invoices.send permission", async () => {
    const { jobId, customerEmail } = await createCustomerJob(
      "customer-email-staff",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-staff-gen-01");
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/send-email`,
      {
        body: JSON.stringify({ idempotencyKey: "email-key-staff-send-01" }),
        headers: await staffHeaders(),
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain(customerEmail!);
    expect(text).not.toContain("GMAIL_CLIENT_ID");
  });

  it("lets a STAFF user with the invoices.send permission through the permission gate", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-staffsend-r",
      null,
    );
    const invoiceId = await generateInvoice(
      jobId,
      "email-key-staffsend-r-gen-01",
    );
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/send-email`,
      {
        body: JSON.stringify({
          idempotencyKey: "email-key-staffsend-r-send-01",
        }),
        headers: await staffSendHeaders(),
        method: "POST",
      },
      env,
    );
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "CUSTOMER_EMAIL_MISSING" },
    });
  });

  it("lets an ADMIN reach the send-email flow through the route", async () => {
    const { jobId } = await createCustomerJob("customer-email-admin-r", null);
    const invoiceId = await generateInvoice(jobId, "email-key-admin-r-gen-01");
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/send-email`,
      {
        body: JSON.stringify({ idempotencyKey: "email-key-admin-r-send-01" }),
        headers: await headers(),
        method: "POST",
      },
      env,
    );
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "CUSTOMER_EMAIL_MISSING" },
    });
  });

  it("returns 404 for an invoice outside the caller's organization", async () => {
    const { jobId } = await createCustomerJob(
      "customer-email-crossorg",
      "meera@example.com",
    );
    const invoiceId = await generateInvoice(jobId, "email-key-crossorg-gen-01");
    const response = await app.request(
      `/api/v1/invoices/${invoiceId}/send-email`,
      {
        body: JSON.stringify({ idempotencyKey: "email-key-crossorg-send-01" }),
        headers: await otherOrgHeaders(),
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 401 without a session", async () => {
    const response = await app.request(
      "/api/v1/invoices/whatever/send-email",
      {
        body: JSON.stringify({ idempotencyKey: "email-key-anon-00000001" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(401);
  });
});
