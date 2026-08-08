import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "first-payment-benefits-session";
const timestamp = "2026-07-30T12:30:00.000Z";

function photoMetadata() {
  return JSON.stringify({
    captureSource: "CAMERA",
    capturedAt: new Date().toISOString(),
    height: 480,
    width: 640,
  });
}

const PHOTO_ASSET_COUNT = 64;

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);

  const photoAssets = Array.from({ length: PHOTO_ASSET_COUNT }, (_, i) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES (?, 'org-wash', 'branch-wash', 'UPLOADS', ?, 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      `asset-benefits-${i}`,
      `org-wash/benefits-${i}.jpg`,
      timestamp,
      timestamp,
      photoMetadata(),
    ),
  );

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-wash', 'Wash Flow', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO branches (id, organization_id, code, name, latitude, longitude, allowed_radius_meters, minimum_gps_accuracy_meters, created_at, updated_at) VALUES ('branch-wash', 'org-wash', 'MAIN', 'Main', 10, 76, 150, 50, ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-wash', 'org-wash', 'branch-wash', 'Wash Admin', 'wash-admin', 'wash-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-wash', 'org-wash', 'branch-wash', 'Wash Staff', 'wash-staff', 'wash-staff', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wash', 'org-wash', 'admin-wash', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('customer-wash', 'org-wash', 'branch-wash', 'Nila Das', 'nila das', '9876543210', '+919876543210', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('referrer-wash', 'org-wash', 'branch-wash', 'Ravi Referrer', 'ravi referrer', '9876543211', '+919876543211', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES ('customer-referral-wash', 'org-wash', 'branch-wash', 'Lina Referred', 'lina referred', '9876543212', '+919876543212', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO referral_codes (id, organization_id, customer_id, code, code_normalized, status, issued_at, created_at, updated_at) VALUES ('refcode-wash', 'org-wash', 'referrer-wash', 'RAVI500', 'RAVI500', 'ACTIVE', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO referral_codes (id, organization_id, customer_id, code, code_normalized, status, issued_at, created_at, updated_at) VALUES ('refcode-customer-self', 'org-wash', 'customer-wash', 'NILA250', 'NILA250', 'ACTIVE', ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('type-wash-sedan', 'org-wash', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-wash', 'org-wash', 'customer-wash', 'type-wash-sedan', 'KL 07 AB 1234', 'KL07AB1234', 'Honda', 'City', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, make, model, created_at, updated_at) VALUES ('vehicle-referral-wash', 'org-wash', 'customer-referral-wash', 'type-wash-sedan', 'KL 07 AB 5678', 'KL07AB5678', 'Honda', 'Amaze', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, estimated_duration_minutes, is_taxable, created_at, updated_at) VALUES ('service-primary', 'org-wash', 'PREMIUM', 'Premium Wash', 'PRIMARY', 10000, 45, 1, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO services (id, organization_id, code, name, service_kind, base_price_minor, estimated_duration_minutes, is_taxable, created_at, updated_at) VALUES ('service-addon-1', 'org-wash', 'WAX', 'Wax Finish', 'ADD_ON', 2000, 10, 1, ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, effective_from, created_at) VALUES ('price-primary-1', 'org-wash', 'service-primary', 'type-wash-sedan', 10000, '2026-01-01T00:00:00.000Z', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, effective_from, created_at) VALUES ('price-addon-1', 'org-wash', 'service-addon-1', 'type-wash-sedan', 2000, '2026-01-01T00:00:00.000Z', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, created_by_user_id, created_at, updated_at) VALUES ('coupon-wash', 'org-wash', 'WELCOME10', 'WELCOME10', 'FIXED', 1000, 5000, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 10, 1, 'admin-wash', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, total_usage_count_cached, is_active, created_by_user_id, created_at, updated_at, version) VALUES ('coupon-repeat', 'org-wash', 'REPEAT10', 'REPEAT10', 'FIXED', 1000, 5000, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 100, 100, 1, 1, 'admin-wash', ?, ?, 1)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, created_by_user_id, created_at, updated_at) VALUES ('coupon-expired', 'org-wash', 'OLD50', 'OLD50', 'FIXED', 500, 0, '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 10, 1, 'admin-wash', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, created_by_user_id, created_at, updated_at) VALUES ('coupon-high-min', 'org-wash', 'BIG500', 'BIG500', 'FIXED', 500, 50000, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 10, 1, 'admin-wash', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, total_usage_count_cached, is_active, created_by_user_id, created_at, updated_at, version) VALUES ('coupon-exhausted', 'org-wash', 'FULL1', 'FULL1', 'FIXED', 1000, 0, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 1, 1, 1, 1, 'admin-wash', ?, ?, 2)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-tax-enabled', 'org-wash', 'tax.enabled', 'BOOLEAN', 'true', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-tax-rate', 'org-wash', 'tax.rate_basis_points', 'INTEGER', '1800', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-rounding', 'org-wash', 'billing.rounding_mode', 'STRING', 'NONE', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-friend', 'org-wash', 'referral.friend_discount_value', 'INTEGER', '1000', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-reward', 'org-wash', 'referral.reward_value', 'INTEGER', '500', ?)"
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-new-customers', 'org-wash', 'referral.new_customers_only', 'BOOLEAN', 'false', ?)"
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-manual-discount-enabled', 'org-wash', 'payment.manual_discount_enabled', 'BOOLEAN', 'true', ?)"
    ).bind(timestamp),
    ...photoAssets,
  ]);
});

let nextAssetIndex = 0;

function getPhotoAssetId(): string {
  const index = nextAssetIndex % PHOTO_ASSET_COUNT;
  nextAssetIndex += 1;
  return `asset-benefits-${index}`;
}

async function mutationHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

type WashJobPayload = {
  addOnServiceIds?: string[];
  assignedUserId?: string;
  customerId?: string;
  idempotencyKey?: string;
  initialStatus?: string;
  notes?: string;
  photoAssetId?: string;
  primaryServiceId?: string;
  vehicleId?: string;
};

async function createWashJob(overrides: WashJobPayload = {}): Promise<{
  id: string;
  status: string;
  totalAmountMinor: number;
  version: number;
}> {
  const headers = await mutationHeaders();
  const counter = Math.random().toString(36).slice(2, 10);
  const resolvedIdempotencyKey = overrides.idempotencyKey ?? `first-benefits-create-${counter}`;
  const { idempotencyKey: _idem, ...restOverrides } = overrides;
  void _idem;
  const res = await app.request(
    "/api/v1/wash-jobs",
    {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: resolvedIdempotencyKey,
        initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: new Date().toISOString(),
        },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        ...restOverrides,
      }),
      headers,
      method: "POST",
    },
    env,
  );
  if (res.status >= 400) {
    const body = await res.json<{ error: { message: string } }>();
    throw new Error(`Wash job creation failed: ${res.status} - ${body.error.message}`);
  }
  const json = await res.json<{
    data: { id: string; status: string; total_amount_minor: number; version: number };
  }>();
  return {
    id: json.data.id,
    status: json.data.status,
    totalAmountMinor: json.data.total_amount_minor,
    version: json.data.version,
  };
}

async function startWashJob(jobId: string, version: number): Promise<number> {
  const headers = await mutationHeaders();
  const res = await app.request(
    `/api/v1/wash-jobs/${jobId}/start`,
    { body: JSON.stringify({ version }), headers, method: "POST" },
    env,
  );
  expect(res.status).toBe(200);
  return (await res.json<{ data: { version: number } }>()).data.version;
}

async function completeWashJob(jobId: string, version: number): Promise<number> {
  const headers = await mutationHeaders();
  const res = await app.request(
    `/api/v1/wash-jobs/${jobId}/complete`,
    { body: JSON.stringify({ version }), headers, method: "POST" },
    env,
  );
  expect(res.status).toBe(200);
  return (await res.json<{ data: { version: number } }>()).data.version;
}

async function startAndComplete(jobId: string, version: number): Promise<number> {
  const v1 = await startWashJob(jobId, version);
  return completeWashJob(jobId, v1);
}

function idemSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// 1. Atomic operation tests
// ---------------------------------------------------------------------------
describe("first payment with benefits - atomic operation", () => {
  it("first payment with valid coupon succeeds", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-coupon-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: { revisedBilling: { couponDiscountMinor: number }; appliedBenefits: { coupon: { code: string; discountMinor: number } | null } };
      success: boolean;
    }>();
    expect(body.data.revisedBilling.couponDiscountMinor).toBeGreaterThan(0);
    expect(body.data.appliedBenefits.coupon).not.toBeNull();
    expect(body.data.appliedBenefits.coupon!.code).toBe("REPEAT10");

    expect(
      await env.DB.prepare("SELECT status FROM coupon_redemptions WHERE wash_job_id = ?")
        .bind(job.id)
        .first("status"),
    ).toBe("RESERVED");
  });

  it("partial first payment with benefits succeeds", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-partial-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: { revisedBilling: { paymentStatus: string; balanceMinor: number } };
      success: boolean;
    }>();
    expect(body.data.revisedBilling.paymentStatus).toBe("PARTIALLY_PAID");
    expect(body.data.revisedBilling.balanceMinor).toBeGreaterThan(0);
  });

  it("benefits reduce total to zero - fully discounted completion", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 0,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            manualDiscountMinor: 9000,
            manualDiscountReason: "Zero-value test discount",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-zero-${idemSuffix()}`,
          method: "CASH",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: { revisedBilling: { totalAmountMinor: number; paymentStatus: string }; fullyDiscounted: boolean; payment: unknown };
      success: boolean;
    }>();
    expect(body.data.fullyDiscounted).toBe(true);
    expect(body.data.revisedBilling.totalAmountMinor).toBe(0);
    expect(body.data.revisedBilling.paymentStatus).toBe("PAID");
    expect(body.data.payment).toBeNull();
  });

  it("no zero-value payment row inserted", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 0,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            manualDiscountMinor: 9000,
            manualDiscountReason: "Zero-value test discount",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-no-payment-row-${idemSuffix()}`,
          method: "CASH",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM payments WHERE wash_job_id = ?")
        .bind(job.id)
        .first<number>("count"),
    ).toBe(0);
  });

  it("version increments exactly once", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-version-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ data: { revisedBilling: { version: number } }; success: boolean }>();
    expect(body.data.revisedBilling.version).toBe(v + 1);
  });

  it("billing_locked_at is set", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-locked-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const locked = await env.DB.prepare(
      "SELECT billing_locked_at FROM wash_jobs WHERE id = ?",
    )
      .bind(job.id)
      .first<Record<string, string | null>>();
    expect(locked).not.toBeNull();
    expect(locked!.billing_locked_at).not.toBeNull();
  });

  it("existing benefits preserved when benefits block omitted", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          idempotencyKey: `benefits-no-block-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const jobRow = await env.DB.prepare(
      "SELECT coupon_discount_minor, billing_locked_at FROM wash_jobs WHERE id = ?",
    )
      .bind(job.id)
      .first<{ coupon_discount_minor: number; billing_locked_at: string | null }>();
    expect(jobRow).not.toBeNull();
    expect(jobRow!.coupon_discount_minor).toBe(0);
    expect(jobRow!.billing_locked_at).not.toBeNull();
  });

  it("complete replacement when one benefit changes", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startWashJob(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "" },
          expectedVersion: v,
          idempotencyKey: `benefits-replace-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const redemption = await env.DB.prepare(
      "SELECT status FROM coupon_redemptions WHERE wash_job_id = ?",
    )
      .bind(job.id)
      .first<string>("status");
    expect(redemption).toBeNull();
  });

  it("explicit removal of every benefit", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startWashJob(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "", referralCode: "" },
          expectedVersion: v,
          idempotencyKey: `benefits-remove-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const redemption = await env.DB.prepare(
      "SELECT status FROM coupon_redemptions WHERE wash_job_id = ?",
    )
      .bind(job.id)
      .first<string>("status");
    expect(redemption).toBeNull();

    const discount = await env.DB.prepare(
      "SELECT coupon_discount_minor FROM wash_jobs WHERE id = ?",
    )
      .bind(job.id)
      .first<number>("coupon_discount_minor");
    expect(discount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Benefit validation tests
// ---------------------------------------------------------------------------
describe("benefit validation during commit", () => {
  it("invalid coupon rejected with COUPON_INVALID", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "NONEXISTENT" },
          expectedVersion: v,
          idempotencyKey: `benefits-bad-coupon-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("COUPON_INVALID");
  });

  it("expired coupon rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "OLD50" },
          expectedVersion: v,
          idempotencyKey: `benefits-expired-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("COUPON_EXPIRED");
  });

  it("coupon below minimum bill rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "BIG500" },
          expectedVersion: v,
          idempotencyKey: `benefits-min-bill-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("COUPON_NOT_ELIGIBLE");
  });

  it("invalid referral rejected with REFERRAL_INVALID", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, referralCode: "BOGUS123" },
          expectedVersion: v,
          idempotencyKey: `benefits-bad-referral-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REFERRAL_INVALID");
  });

  it("self-referral rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, referralCode: "NILA250" },
          expectedVersion: v,
          idempotencyKey: `benefits-self-referral-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REFERRAL_SELF_USE");
  });

  it("coupon and referral stacking succeeds with combined discount", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 8000,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            referralCode: "RAVI500",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-stacking-ok-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: {
        revisedBilling: {
          couponDiscountMinor: number;
          referralDiscountMinor: number;
          totalDiscountMinor: number;
          totalAmountMinor: number;
        };
        appliedBenefits: {
          coupon: { code: string; discountMinor: number } | null;
          referral: { code: string; discountMinor: number } | null;
        };
      };
    }>();

    // Both discounts applied separately
    expect(body.data.revisedBilling.couponDiscountMinor).toBe(1000);
    expect(body.data.revisedBilling.referralDiscountMinor).toBe(1000);
    expect(body.data.revisedBilling.totalDiscountMinor).toBe(2000);

    // Both benefits recorded
    expect(body.data.appliedBenefits.coupon).not.toBeNull();
    expect(body.data.appliedBenefits.coupon!.code).toBe("REPEAT10");
    expect(body.data.appliedBenefits.coupon!.discountMinor).toBe(1000);
    expect(body.data.appliedBenefits.referral).not.toBeNull();
    expect(body.data.appliedBenefits.referral!.code).toBe("RAVI500");
    expect(body.data.appliedBenefits.referral!.discountMinor).toBe(1000);

    // Combined discount reflected in final amount (tax decreases with lower taxable amount)
    expect(body.data.revisedBilling.totalAmountMinor).toBe(9440);

    // Both persisted separately in DB
    const dbJob = await env.DB.prepare(
      "SELECT coupon_discount_minor, referral_discount_minor FROM wash_jobs WHERE id = ?"
    ).bind(job.id).first<{ coupon_discount_minor: number; referral_discount_minor: number }>();
    expect(dbJob!.coupon_discount_minor).toBe(1000);
    expect(dbJob!.referral_discount_minor).toBe(1000);

    // Coupon redemption recorded
    const cr = await env.DB.prepare(
      "SELECT status, discount_amount_minor FROM coupon_redemptions WHERE wash_job_id = ?"
    ).bind(job.id).first<{ status: string; discount_amount_minor: number }>();
    expect(cr!.status).toBe("RESERVED");
    expect(cr!.discount_amount_minor).toBe(1000);

    // Referral redemption recorded
    const rr = await env.DB.prepare(
      `SELECT rr.status, rr.friend_discount_minor
       FROM referral_redemptions rr WHERE rr.referred_wash_job_id = ?`
    ).bind(job.id).first<{ status: string; friend_discount_minor: number }>();
    expect(rr!.status).toBe("PENDING");
    expect(rr!.friend_discount_minor).toBe(1000);
  });

  it("invalid coupon prevents both coupon and referral from persisting", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            couponCode: "INVALIDCOUPON",
            referralCode: "RAVI500",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-invalid-coupon-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string; fields?: Record<string, string> } }>();
    expect(body.error.code).toBe("COUPON_INVALID");

    // Neither benefit persisted
    const cr = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE wash_job_id = ?"
    ).bind(job.id).first<number>("count");
    expect(cr ?? 0).toBe(0);

    const rr = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM referral_redemptions WHERE referred_wash_job_id = ?"
    ).bind(job.id).first<number>("count");
    expect(rr ?? 0).toBe(0);
  });

  it("invalid referral prevents both coupon and referral from persisting", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            referralCode: "INVALIDREF",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-invalid-ref-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string; fields?: Record<string, string> } }>();
    expect(body.error.code).toBe("REFERRAL_INVALID");

    // Neither benefit persisted
    const cr = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE wash_job_id = ?"
    ).bind(job.id).first<number>("count");
    expect(cr ?? 0).toBe(0);

    const rr = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM referral_redemptions WHERE referred_wash_job_id = ?"
    ).bind(job.id).first<number>("count");
    expect(rr ?? 0).toBe(0);
  });

  it("combined discount does not reduce total below zero", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob({
      primaryServiceId: "service-primary",
      customerId: "customer-referral-wash",
      vehicleId: "vehicle-referral-wash",
    });
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 8000,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            referralCode: "RAVI500",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-negative-guard-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: {
        revisedBilling: { totalAmountMinor: number; totalDiscountMinor: number };
      };
    }>();
    // Total must never be negative
    expect(body.data.revisedBilling.totalAmountMinor).toBeGreaterThanOrEqual(0);
    expect(body.data.revisedBilling.totalAmountMinor).toBe(9440);
  });

  it("unavailable reward rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            rewardId: "reward-nonexistent-999999",
            rewardAmountMinor: 500,
          },
          expectedVersion: v,
          idempotencyKey: `benefits-bad-reward-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REWARD_NOT_FOUND");
  });

  it("reward amount exceeded rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            rewardId: "reward-fake-000000000001",
            rewardAmountMinor: 10000,
          },
          expectedVersion: v,
          idempotencyKey: `benefits-reward-exceed-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REWARD_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// 3. Guard and rollback tests
// ---------------------------------------------------------------------------

async function assertZeroFinancialMutations(jobId: string, {
  expectedWashJobVersion,
  preAuditCount,
}: {
  expectedWashJobVersion: number;
  preAuditCount: number;
}) {
  // payments: no new row
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM payments WHERE wash_job_id = ?")
      .bind(jobId)
      .first<number>("count"),
  ).toBe(0);

  // wash_jobs: version unchanged, billing columns unchanged, billing_locked_at null
  const jobRow = await env.DB.prepare(
    "SELECT version, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, paid_amount_minor, billing_locked_at, rounding_mode FROM wash_jobs WHERE id = ?",
  )
    .bind(jobId)
    .first<Record<string, unknown>>();
  expect(jobRow).not.toBeNull();
  expect(jobRow!.version).toBe(expectedWashJobVersion);
  expect(jobRow!.coupon_discount_minor).toBe(0);
  expect(jobRow!.referral_discount_minor).toBe(0);
  expect(jobRow!.reward_discount_minor).toBe(0);
  expect(jobRow!.manual_discount_minor).toBe(0);
  expect(jobRow!.paid_amount_minor).toBe(0);
  expect(jobRow!.billing_locked_at).toBeNull();

  // coupon_redemptions: no rows for this job
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM coupon_redemptions WHERE wash_job_id = ?")
      .bind(jobId)
      .first<number>("count"),
  ).toBe(0);

  // referral_redemptions: no rows for this job
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM referral_redemptions WHERE referred_wash_job_id = ?")
      .bind(jobId)
      .first<number>("count"),
  ).toBe(0);

  // referral_rewards: seed reward-test unchanged (may not exist for stale-version/coupon tests)
  const rewardRow = await env.DB.prepare(
    "SELECT remaining_amount_minor, status FROM referral_rewards WHERE id = 'reward-test'",
  ).first<{ remaining_amount_minor: number; status: string }>();
  if (rewardRow) {
    expect(rewardRow.remaining_amount_minor).toBe(100);
    expect(rewardRow.status).toBe("AVAILABLE");
  }

  // referral_reward_transactions: no new rows for this job
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM referral_reward_transactions WHERE wash_job_id = ?")
      .bind(jobId)
      .first<number>("count"),
  ).toBe(0);

  // referral_codes: code refcode-wash unchanged (successful_referrals_cached = 0)
  const refCode = await env.DB.prepare(
    "SELECT successful_referrals_cached FROM referral_codes WHERE id = 'refcode-wash'",
  ).first<number>("successful_referrals_cached");
  expect(refCode).toBe(0);

  // audit_logs: no new rows for this job
  const postAuditCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
  )
    .bind(jobId)
    .first<number>("count");
  expect(postAuditCount).toBe(preAuditCount);

  // idempotency_keys: no PROCESSING or COMPLETED row for FIRST_PAYMENT_WITH_BENEFITS
  const idemRow = await env.DB.prepare(
    "SELECT state FROM idempotency_keys WHERE organization_id = 'org-wash' AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND resource_id = ?",
  )
    .bind(jobId)
    .first<{ state: string }>();
  expect(idemRow).toBeNull();

  // financial_operation_guards: no rows (they're cleaned up on success, never persisted on failure)
  const guardCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM financial_operation_guards",
  ).first<number>("count");
  expect(guardCount).toBe(0);
}

describe("guard rollback - forced failures", () => {
  it("stale version causes complete rollback - zero financial mutations", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const preAuditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v + 99,
          idempotencyKey: `benefits-stale-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("STALE_VERSION");

    await assertZeroFinancialMutations(job.id, {
      expectedWashJobVersion: v,
      preAuditCount: preAuditCount ?? 0,
    });
  });

  it("coupon capacity exhausted causes rollback - zero financial mutations", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const preAuditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "FULL1" },
          expectedVersion: v,
          idempotencyKey: `benefits-exhausted-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("COUPON_LIMIT_REACHED");

    await assertZeroFinancialMutations(job.id, {
      expectedWashJobVersion: v,
      preAuditCount: preAuditCount ?? 0,
    });
  });

  it("reward balance insufficient causes rollback - zero financial mutations", async () => {
    const headers = await mutationHeaders();

    // Create a dummy completed job to act as the referral trigger
    const dummyJob = await createWashJob({ idempotencyKey: `reward-seed-job-${idemSuffix()}` });
    await startAndComplete(dummyJob.id, dummyJob.version);

    // Create a reward for the same customer via direct D1 inserts
    const now = new Date().toISOString();
    const rrId = `rr-reward-test-${idemSuffix()}`;
    const rewardId = `reward-test-dynamic-${idemSuffix()}`;
    const referredCustomerId = `customer-reward-test-${idemSuffix()}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, created_at, updated_at) VALUES (?, 'org-wash', 'branch-wash', 'Reward Test', 'reward test', '0000000000', '+910000000000', ?, ?, ?)"
      ).bind(referredCustomerId, now, now, now),
      env.DB.prepare(
        "INSERT INTO referral_redemptions (id, organization_id, referral_code_id, referring_customer_id, referred_customer_id, referred_wash_job_id, status, friend_discount_type_snapshot, friend_discount_value_snapshot, friend_discount_minor, reward_type_snapshot, reward_value_snapshot, reward_amount_minor, created_at, qualified_at, created_by_user_id) VALUES (?, 'org-wash', 'refcode-wash', 'referrer-wash', ?, ?, 'REWARD_ISSUED', 'FIXED', 0, 0, 'FIXED', 100, 100, ?, ?, 'admin-wash')",
      ).bind(rrId, referredCustomerId, dummyJob.id, now, now),
      env.DB.prepare(
        "INSERT INTO referral_rewards (id, organization_id, customer_id, referral_redemption_id, status, original_amount_minor, remaining_amount_minor, earned_at, available_from, expires_at, created_at, updated_at, version) VALUES (?, 'org-wash', 'customer-wash', ?, 'AVAILABLE', 100, 100, ?, ?, '2099-01-01T00:00:00.000Z', ?, ?, 1)",
      ).bind(rewardId, rrId, now, now, now, now),
    ]);

    // Create the actual test job
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const preAuditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            rewardId: rewardId,
            rewardAmountMinor: 99999,
          },
          expectedVersion: v,
          idempotencyKey: `benefits-reward-rollback-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REWARD_INSUFFICIENT");

    await assertZeroFinancialMutations(job.id, {
      expectedWashJobVersion: v,
      preAuditCount: preAuditCount ?? 0,
    });
  });

  it("billing locked job rejected", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const first = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-lock-1-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json<{ data: { revisedBilling: { version: number } }; success: boolean }>();

    const second = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: firstBody.data.revisedBilling.version,
          idempotencyKey: `benefits-lock-2-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(second.status).toBe(409);
    const secondBody = await second.json<{ error: { code: string } }>();
    expect(secondBody.error.code).toBe("BENEFITS_LOCKED");
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency tests
// ---------------------------------------------------------------------------
describe("combined operation idempotency", () => {
  it("identical completed replay returns original status and body", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-idem-replay-${idemSuffix()}`;

    const first = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(first.status).toBe(201);

    const replay = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(replay.status).toBe(200);
    const replayBody = await replay.json<{ idempotentReplay: boolean; data: { paymentStatus: string } }>();
    expect(replayBody.idempotentReplay).toBe(true);
    expect(replayBody.data.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("same key with different payload is silently idempotent via payment replay", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-idem-same-key-${idemSuffix()}`;

    const first = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(first.status).toBe(201);

    const second = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 6000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "CASH",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ idempotentReplay: boolean }>();
    expect(secondBody.idempotentReplay).toBe(true);
  });

  it("fully discounted first payment creates idempotency record", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-zero-idem-${idemSuffix()}`;

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 0,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            manualDiscountMinor: 9000,
            manualDiscountReason: "Zero-value idem record test",
          },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "CASH",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ data: { fullyDiscounted: boolean }; success: boolean }>();
    expect(body.data.fullyDiscounted).toBe(true);

    const idemRow = await env.DB.prepare(
      "SELECT state FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?",
    )
      .bind("org-wash", idemKey)
      .first<{ state: string }>();
    expect(idemRow).not.toBeNull();
    expect(idemRow!.state).toBe("COMPLETED");
  });

  it("failed batch leaves no PROCESSING idempotency row", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-fail-batch-${idemSuffix()}`;

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "NONEXISTENT" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    const idemRow = await env.DB.prepare(
      "SELECT state FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?",
    )
      .bind("org-wash", idemKey)
      .first<{ state: string }>();
    expect(idemRow).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Audit tests
// ---------------------------------------------------------------------------
describe("audit logging", () => {
  it("positive payment creates PAYMENT_RECORDED in audit", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-audit-paid-${idemSuffix()}`;

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    const payment = await env.DB.prepare(
      "SELECT id FROM payments WHERE wash_job_id = ? AND idempotency_key = ?",
    )
      .bind(job.id, idemKey)
      .first<string>("id");
    expect(payment).not.toBeNull();

    const auditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_type = 'PAYMENT' AND action = 'PAYMENT_RECORDED' AND record_id = ?",
    )
      .bind(payment!)
      .first<number>("count");
    expect(auditCount).toBe(1);
  });

  it("fully discounted completion creates FULLY_DISCOUNTED_COMPLETION, not PAYMENT_RECORDED", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 0,
          benefits: {
            replaceExisting: true,
            couponCode: "REPEAT10",
            manualDiscountMinor: 9000,
            manualDiscountReason: "Audit zero test",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-audit-zero-${idemSuffix()}`,
          method: "CASH",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    const fullyDiscounted = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_type = 'WASH_JOB' AND action = 'FULLY_DISCOUNTED_COMPLETION' AND record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");
    expect(fullyDiscounted).toBeGreaterThan(0);

    const paymentAudit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_type = 'PAYMENT' AND action = 'PAYMENT_RECORDED' AND record_id IN (SELECT id FROM payments WHERE wash_job_id = ?)",
    )
      .bind(job.id)
      .first<number>("count");
    expect(paymentAudit).toBe(0);
  });

  it("failed batch creates zero audit entries", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const preCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "NONEXISTENT" },
          expectedVersion: v,
          idempotencyKey: `benefits-audit-fail-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    const postCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");
    expect(postCount).toBe(preCount);
  });

  it("applying a coupon during first payment creates COUPON_APPLIED audit", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startWashJob(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "WELCOME10" },
          expectedVersion: v,
          idempotencyKey: `benefits-audit-order-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const audits = await env.DB.prepare(
      "SELECT action, created_at FROM audit_logs WHERE record_id = ? AND action IN ('COUPON_APPLIED') ORDER BY created_at ASC",
    )
      .bind(job.id)
      .all<{ action: string; created_at: string }>();

    expect(audits.results).toHaveLength(1);
    expect(audits.results[0]!.action).toBe("COUPON_APPLIED");
  });

  it("new coupon application creates audit record", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-audit-unchanged-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const benefitAuditCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ? AND action IN ('COUPON_APPLIED')",
    )
      .bind(job.id)
      .first<number>("count");
    expect(benefitAuditCount).toBe(1);
  });

  it("failed guard batch generates zero audit entries", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const preCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v - 1,
          idempotencyKey: `benefits-audit-guard-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(409);

    const postCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ?",
    )
      .bind(job.id)
      .first<number>("count");
    expect(postCount).toBe(preCount);
  });

  it("idempotent replay generates no additional audit records", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);
    const idemKey = `benefits-audit-replay-${idemSuffix()}`;

    const first = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(first.status).toBe(201);

    const payment = await env.DB.prepare(
      "SELECT id FROM payments WHERE wash_job_id = ? AND idempotency_key = ?",
    )
      .bind(job.id, idemKey)
      .first<string>("id");
    expect(payment).not.toBeNull();

    const firstCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ? AND action = 'PAYMENT_RECORDED'",
    )
      .bind(payment!)
      .first<number>("count");
    expect(firstCount).toBe(1);

    await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: idemKey,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );

    const replayCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE record_id = ? AND action = 'PAYMENT_RECORDED'",
    )
      .bind(payment!)
      .first<number>("count");
    expect(replayCount).toBe(1);
  });

  it("manual discount reason is validated and stored", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            manualDiscountMinor: 2000,
            manualDiscountReason: "Loyalty gesture",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-audit-manual-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);

    const payment = await env.DB.prepare(
      "SELECT id FROM payments WHERE wash_job_id = ?",
    )
      .bind(job.id)
      .first<string>("id");
    expect(payment).not.toBeNull();

    const audit = await env.DB.prepare(
      "SELECT action, severity, reason, new_value_json FROM audit_logs WHERE record_id = ? AND action = 'PAYMENT_RECORDED' ORDER BY created_at DESC LIMIT 1",
    )
      .bind(payment!)
      .first<{ action: string; severity: string; reason: string | null; new_value_json: string | null }>();
    expect(audit).not.toBeNull();
    expect(audit!.action).toBe("PAYMENT_RECORDED");

    const jobRow = await env.DB.prepare(
      "SELECT manual_discount_minor, manual_discount_reason FROM wash_jobs WHERE id = ?",
    )
      .bind(job.id)
      .first<{ manual_discount_minor: number; manual_discount_reason: string | null }>();
    expect(jobRow).not.toBeNull();
    expect(jobRow!.manual_discount_minor).toBe(2000);
    expect(jobRow!.manual_discount_reason).toBe("Loyalty gesture");
  });
});

// ---------------------------------------------------------------------------
// 6. Concurrency test
// ---------------------------------------------------------------------------
describe("concurrency", () => {
  it("overlapping requests - exactly one succeeds", async () => {
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const sharedBody = {
      amountMinor: 5000,
      benefits: { replaceExisting: true, couponCode: "REPEAT10" },
      expectedVersion: v,
      method: "UPI",
      washJobId: job.id,
    };

    const request1 = app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({ ...sharedBody, idempotencyKey: `concurrency-a-${idemSuffix()}` }),
        headers,
        method: "POST",
      },
      env,
    );

    const request2 = app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({ ...sharedBody, idempotencyKey: `concurrency-b-${idemSuffix()}` }),
        headers,
        method: "POST",
      },
      env,
    );

    const results = await Promise.allSettled([request1, request2]);
    const statuses = results
      .filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled")
      .map((r) => r.value.status);

    expect(statuses).toContain(201);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const redeemedCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE wash_job_id = ? AND status = 'RESERVED'",
    )
      .bind(job.id)
      .first<number>("count");
    expect(redeemedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Strict schema rejection test
// ---------------------------------------------------------------------------
describe("wash job creation — strict schema", () => {
  it("rejects benefit fields as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: "reject-benefits-01",
        initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        couponCode: "TEST",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects referralCode as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: "reject-benefits-02",
        initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        referralCode: "ABC",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects rewardId as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: "reject-benefits-03",
        initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        rewardId: "R001",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects manualDiscountMinor as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: "reject-benefits-04",
        initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        manualDiscountMinor: 100,
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects rewardAmountMinor as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [], assignedUserId: "staff-wash", customerId: "customer-wash",
        idempotencyKey: "reject-benefits-05", initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        }, photoAssetId: getPhotoAssetId(), primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        rewardAmountMinor: 500,
      }),
      headers, method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects manualDiscountReason as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [], assignedUserId: "staff-wash", customerId: "customer-wash",
        idempotencyKey: "reject-benefits-06", initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        }, photoAssetId: getPhotoAssetId(), primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        manualDiscountReason: "test",
      }),
      headers, method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects benefits as unknown via strict schema", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [], assignedUserId: "staff-wash", customerId: "customer-wash",
        idempotencyKey: "reject-benefits-07", initialStatus: "WAITING",
        location: {
          place: "Test Location, Kochi",
          capturedAt: "2026-08-08T10:00:00.000Z",
        }, photoAssetId: getPhotoAssetId(), primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
        benefits: { replaceExisting: true, manualDiscountMinor: 0 },
      }),
      headers, method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 7b. Location is required for every wash-job creation
// ---------------------------------------------------------------------------
describe("wash job creation — location required", () => {
  const validLocation = {
    place: "Test Location, Kochi",
    capturedAt: "2026-08-08T10:00:00.000Z",
  };

  async function createWithoutLocation(status: string): Promise<Response> {
    const headers = await mutationHeaders();
    return app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: `loc-required-${status.toLowerCase()}-${idemSuffix()}`,
        initialStatus: status,
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
      }),
      headers,
      method: "POST",
    }, env);
  }

  it("rejects DRAFT creation without location", async () => {
    const res = await createWithoutLocation("DRAFT");
    expect(res.status).toBe(422);
  });

  it("rejects WAITING creation without location", async () => {
    const res = await createWithoutLocation("WAITING");
    expect(res.status).toBe(422);
  });

  it("rejects IN_PROGRESS creation without location", async () => {
    const res = await createWithoutLocation("IN_PROGRESS");
    expect(res.status).toBe(422);
  });

  it("rejects a whitespace-only place", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: `loc-blank-${idemSuffix()}`,
        initialStatus: "DRAFT",
        location: { place: "   ", capturedAt: "2026-08-08T10:00:00.000Z" },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("rejects a coordinate-only place", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: `loc-coords-${idemSuffix()}`,
        initialStatus: "DRAFT",
        location: { place: "9.8116, 76.2999", capturedAt: "2026-08-08T10:00:00.000Z" },
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(422);
  });

  it("accepts DRAFT creation with a valid location", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: `loc-valid-draft-${idemSuffix()}`,
        initialStatus: "DRAFT",
        location: validLocation,
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(201);
  });

  it("accepts IN_PROGRESS creation with a valid location", async () => {
    const headers = await mutationHeaders();
    const res = await app.request("/api/v1/wash-jobs", {
      body: JSON.stringify({
        addOnServiceIds: [],
        assignedUserId: "staff-wash",
        customerId: "customer-wash",
        idempotencyKey: `loc-inprogress-${idemSuffix()}`,
        initialStatus: "IN_PROGRESS",
        location: validLocation,
        photoAssetId: getPhotoAssetId(),
        primaryServiceId: "service-primary",
        vehicleId: "vehicle-wash",
      }),
      headers,
      method: "POST",
    }, env);
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 8. Manual discount toggle enforcement
// ---------------------------------------------------------------------------
describe("manual discount toggle enforcement", () => {
  async function disableManualDiscounts(): Promise<void> {
    await env.DB.prepare(
      "UPDATE business_settings SET value_text = 'false', updated_at = ? WHERE organization_id = 'org-wash' AND setting_key = 'payment.manual_discount_enabled'",
    ).bind(timestamp).run();
  }

  it("verify-benefits rejects a manual discount when disabled", async () => {
    await disableManualDiscounts();
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      `/api/v1/wash-jobs/${job.id}/verify-benefits`,
      {
        body: JSON.stringify({
          expectedVersion: v,
          benefits: {
            replaceExisting: true,
            manualDiscountMinor: 2000,
            manualDiscountReason: "Loyalty gesture",
          },
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe("MANUAL_DISCOUNT_DISABLED");
    expect(body.error.message).toBe("Manual discounts are disabled for this business.");
  });

  it("payment with a manual discount is rejected when disabled", async () => {
    await disableManualDiscounts();
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            manualDiscountMinor: 2000,
            manualDiscountReason: "Loyalty gesture",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-disabled-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("MANUAL_DISCOUNT_DISABLED");
  });

  it("payment without a manual discount still succeeds when disabled", async () => {
    await disableManualDiscounts();
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: { replaceExisting: true, couponCode: "REPEAT10" },
          expectedVersion: v,
          idempotencyKey: `benefits-no-manual-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
  });

  it("payment with a reason but no discount is rejected when disabled", async () => {
    await disableManualDiscounts();
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            manualDiscountMinor: 0,
            manualDiscountReason: "Loyalty gesture",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-reason-only-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("payment with a manual discount succeeds when enabled", async () => {
    await env.DB.prepare(
      "UPDATE business_settings SET value_text = 'true', updated_at = ? WHERE organization_id = 'org-wash' AND setting_key = 'payment.manual_discount_enabled'",
    ).bind(timestamp).run();
    const headers = await mutationHeaders();
    const job = await createWashJob();
    const v = await startAndComplete(job.id, job.version);

    const res = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          benefits: {
            replaceExisting: true,
            manualDiscountMinor: 2000,
            manualDiscountReason: "Loyalty gesture",
          },
          expectedVersion: v,
          idempotencyKey: `benefits-enabled-${idemSuffix()}`,
          method: "UPI",
          washJobId: job.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(res.status).toBe(201);
  });
});
