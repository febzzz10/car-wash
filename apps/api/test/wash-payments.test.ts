import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "wash-payment-integration-session";
const rawStaffToken = "wash-payment-staff-session";
const timestamp = "2026-07-23T12:30:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const staffTokenHash = await hashSessionToken(
    rawStaffToken,
    env.SESSION_PEPPER,
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
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-wash-2', 'org-wash', 'branch-wash', 'Shift B', 'wash-second', 'wash-second', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('staff-wash-disabled', 'org-wash', 'branch-wash', 'Retired Staff', 'wash-retired', 'wash-retired', 'unused', 'STAFF', 'DISABLED', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wash', 'org-wash', 'admin-wash', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-wash-staff', 'org-wash', 'staff-wash-2', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffTokenHash, timestamp, timestamp),
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
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-referral-wash', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/referral-live.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash-2', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live2.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash-3', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live3.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash-4', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live4.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash-5', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live5.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at, metadata_json) VALUES ('asset-live-wash-6', 'org-wash', 'branch-wash', 'UPLOADS', 'org-wash/live6.jpg', 'image/jpeg', 4, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', 'admin-wash', ?, ?, ?)",
    ).bind(
      timestamp,
      timestamp,
      JSON.stringify({
        captureSource: "CAMERA",
        capturedAt: new Date().toISOString(),
        height: 480,
        width: 640,
      }),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO coupons (id, organization_id, code, code_normalized, discount_type, discount_value, minimum_bill_minor, start_at, expires_at, total_usage_limit, usage_limit_per_customer, created_by_user_id, created_at, updated_at) VALUES ('coupon-wash', 'org-wash', 'WELCOME10', 'WELCOME10', 'FIXED', 1000, 5000, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 10, 1, 'admin-wash', ?, ?)",
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
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-allow-refunds', 'org-wash', 'payment.allow_refunds', 'BOOLEAN', 'true', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-reward', 'org-wash', 'referral.reward_value', 'INTEGER', '500', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-new-customers', 'org-wash', 'referral.new_customers_only', 'BOOLEAN', 'false', ?)",
    ).bind(timestamp),
  ]);
});

async function mutationHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

describe("wash, timer, payment, and refund workflow", () => {
  it("applies referral benefit during first payment and completes job", async () => {
    const headers = await mutationHeaders();
    const createdResponse = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash",
          customerId: "customer-referral-wash",
          idempotencyKey: "referral-wash-create-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-referral-wash",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-referral-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json<{
      data: { id: string; total_amount_minor: number; version: number };
    }>();
    let version = created.data.version;
    for (const action of ["start", "complete"] as const) {
      const response = await app.request(
        `/api/v1/wash-jobs/${created.data.id}/${action}`,
        {
          body: JSON.stringify({ version }),
          headers,
          method: "POST",
        },
        env,
      );
      expect(response.status).toBe(200);
      version = (await response.json<{ data: { version: number } }>()).data
        .version;
    }
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM referral_rewards WHERE customer_id = 'referrer-wash'",
      ).first<number>("count"),
    ).toBe(0);
    const payment = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 10620,
          benefits: { replaceExisting: true, referralCode: "RAVI500" },
          expectedVersion: version,
          idempotencyKey: "referral-full-payment-0001",
          method: "UPI",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(payment.status).toBe(201);
    const paymentData = await payment.json<{
      data: {
        appliedBenefits: {
          referral: { discountMinor: number; code: string } | null;
        };
      };
    }>();
    expect(paymentData.data.appliedBenefits.referral).not.toBeNull();
    expect(
      paymentData.data.appliedBenefits.referral!.discountMinor,
    ).toBeGreaterThan(0);
    expect(paymentData.data.appliedBenefits.referral!.code).toBe("RAVI500");
  });

  it("includes the assigned staff snapshot from the related wash job in the payments list", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash",
          customerId: "customer-wash",
          idempotencyKey: "assigned-snapshot-create-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash-4",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      data: { id: string; total_amount_minor: number; version: number };
    }>();
    let version = created.data.version;
    for (const action of ["start", "complete"] as const) {
      const response = await app.request(
        `/api/v1/wash-jobs/${created.data.id}/${action}`,
        {
          body: JSON.stringify({ version }),
          headers,
          method: "POST",
        },
        env,
      );
      expect(response.status).toBe(200);
      version = (await response.json<{ data: { version: number } }>()).data
        .version;
    }

    for (const [amountMinor, idempotencyKey, method] of [
      [5000, "assigned-snapshot-pay-0001", "UPI"],
      [
        created.data.total_amount_minor - 5000,
        "assigned-snapshot-pay-0002",
        "CASH",
      ],
    ] as const) {
      const payment = await app.request(
        "/api/v1/payments",
        {
          body: JSON.stringify({
            amountMinor,
            idempotencyKey,
            method,
            washJobId: created.data.id,
          }),
          headers,
          method: "POST",
        },
        env,
      );
      expect(payment.status).toBe(201);
    }

    const list = await app.request(
      "/api/v1/payments",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(list.status).toBe(200);
    const body = await list.json<{
      data: {
        assigned_user_name_snapshot: string | null;
        id: string;
        wash_job_id: string;
      }[];
    }>();
    const rows = body.data.filter((row) => row.wash_job_id === created.data.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.assigned_user_name_snapshot).toBe("Wash Staff");
    }
  });

  it("creates priced snapshots and preserves timer and financial integrity", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          addOnServiceIds: ["service-addon-1"],
          assignedUserId: "staff-wash",
          customerId: "customer-wash",
          idempotencyKey: "wash-create-key-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{
      data: {
        id: string;
        status: string;
        total_amount_minor: number;
        version: number;
      };
    }>();
    expect(created.data).toMatchObject({
      status: "WAITING",
      total_amount_minor: 14160,
    });

    const retry = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({ idempotencyKey: "wash-create-key-0001" }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(retry.status).toBe(200);
    expect((await retry.json<{ data: { id: string } }>()).data.id).toBe(
      created.data.id,
    );

    let version = created.data.version;
    const action = async (name: string): Promise<Response> =>
      app.request(
        `/api/v1/wash-jobs/${created.data.id}/${name}`,
        { body: JSON.stringify({ version }), headers, method: "POST" },
        env,
      );

    const started = await action("start");
    expect(started.status).toBe(200);
    version = (await started.clone().json<{ data: { version: number } }>()).data
      .version;
    const duplicateStart = await action("start");
    expect(duplicateStart.status).toBe(409);

    const paused = await action("pause");
    version = (await paused.clone().json<{ data: { version: number } }>()).data
      .version;
    const resumed = await action("resume");
    version = (await resumed.clone().json<{ data: { version: number } }>()).data
      .version;
    const completed = await action("complete");
    expect(completed.status).toBe(200);
    const completedBody = await completed.json<{
      data: { status: string; version: number };
    }>();
    expect(completedBody).toMatchObject({ data: { status: "COMPLETED" } });

    const correction = await app.request(
      `/api/v1/wash-jobs/${created.data.id}/timer-adjustments`,
      {
        body: JSON.stringify({
          adjustmentType: "ACTIVE_DURATION_CORRECTION",
          newValue: "1800",
          reason: "Correct verified bay log duration",
          version: completedBody.data.version,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(correction.status).toBe(201);
    expect(await correction.json()).toMatchObject({
      data: { total_active_seconds: 1800 },
    });

    const timer = await app.request(
      `/api/v1/wash-jobs/${created.data.id}/timer`,
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(timer.status).toBe(200);
    const timerBody = await timer.json<{
      data: { adjustments: unknown[]; events: unknown[] };
    }>();
    expect(timerBody.data.events).toHaveLength(4);
    expect(timerBody.data.adjustments).toHaveLength(1);
    const partial = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          idempotencyKey: "payment-key-partial-0001",
          method: "UPI",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(partial.status).toBe(201);
    const partialBody = await partial.json<{
      data: {
        id: string;
        paymentStatus: string;
        remainingBalanceMinor: number;
      };
    }>();
    expect(partialBody.data).toMatchObject({
      paymentStatus: "PARTIALLY_PAID",
      remainingBalanceMinor: 9160,
    });

    const duplicatePayment = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          idempotencyKey: "payment-key-partial-0001",
          method: "UPI",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(duplicatePayment.status).toBe(200);
    expect(
      (await duplicatePayment.json<{ data: { id: string } }>()).data.id,
    ).toBe(partialBody.data.id);

    const finalPayment = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 9160,
          idempotencyKey: "payment-key-final-00001",
          method: "CASH",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(finalPayment.status).toBe(201);
    expect(await finalPayment.json()).toMatchObject({
      data: { paymentStatus: "PAID" },
    });

    const refund = await app.request(
      `/api/v1/payments/${partialBody.data.id}/refund`,
      {
        body: JSON.stringify({
          amountMinor: 1000,
          idempotencyKey: "refund-key-000000001",
          reason: "Customer service recovery",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(refund.status).toBe(201);
    expect(await refund.json()).toMatchObject({
      data: { paymentStatus: "PARTIALLY_PAID", remainingBalanceMinor: 1000 },
    });

    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM payments WHERE wash_job_id = ?",
      )
        .bind(created.data.id)
        .first("count"),
    ).toBe(2);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM refunds WHERE wash_job_id = ?",
      )
        .bind(created.data.id)
        .first("count"),
    ).toBe(1);
  });

  it("blocks refund when payment.allow_refunds is false", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash",
          customerId: "customer-wash",
          idempotencyKey: "refund-false-create-001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash-2",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    if (create.status !== 201) {
      const errText = await create.clone().text();
      throw new Error(
        `Wash job creation returned ${create.status}: ${errText}`,
      );
    }
    const created = await create.json<{
      data: { id: string; version: number };
    }>();

    let version = created.data.version;
    for (const action of ["start", "complete"] as const) {
      const r = await app.request(
        `/api/v1/wash-jobs/${created.data.id}/${action}`,
        { body: JSON.stringify({ version }), headers, method: "POST" },
        env,
      );
      expect(r.status).toBe(200);
      version = (await r.json<{ data: { version: number } }>()).data.version;
    }

    const paymentR = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 10000,
          idempotencyKey: "refund-false-pay-001",
          method: "CASH",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(paymentR.status).toBe(201);
    const paymentData = await paymentR.json<{ data: { id: string } }>();

    await env.DB.prepare(
      "UPDATE business_settings SET value_text = 'false' WHERE organization_id = 'org-wash' AND setting_key = 'payment.allow_refunds'",
    ).run();

    const refund = await app.request(
      `/api/v1/payments/${paymentData.data.id}/refund`,
      {
        body: JSON.stringify({
          amountMinor: 1000,
          idempotencyKey: "refund-false-001",
          reason: "Should be blocked",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(refund.status).toBe(403);
    const body = await refund.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REFUNDS_DISABLED");
  });

  it("blocks refund when payment.allow_refunds is absent", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash",
          customerId: "customer-wash",
          idempotencyKey: "refund-absent-create-001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash-3",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    if (create.status !== 201) {
      const errText = await create.clone().text();
      throw new Error(
        `Wash job creation returned ${create.status}: ${errText}`,
      );
    }
    const created = await create.json<{
      data: { id: string; version: number };
    }>();

    let version = created.data.version;
    for (const action of ["start", "complete"] as const) {
      const r = await app.request(
        `/api/v1/wash-jobs/${created.data.id}/${action}`,
        { body: JSON.stringify({ version }), headers, method: "POST" },
        env,
      );
      expect(r.status).toBe(200);
      version = (await r.json<{ data: { version: number } }>()).data.version;
    }

    const paymentR = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 10000,
          idempotencyKey: "refund-absent-pay-001",
          method: "CASH",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(paymentR.status).toBe(201);
    const paymentData = await paymentR.json<{ data: { id: string } }>();

    await env.DB.prepare(
      "DELETE FROM business_settings WHERE organization_id = 'org-wash' AND setting_key = 'payment.allow_refunds'",
    ).run();

    const refund = await app.request(
      `/api/v1/payments/${paymentData.data.id}/refund`,
      {
        body: JSON.stringify({
          amountMinor: 1000,
          idempotencyKey: "refund-absent-001",
          reason: "Should be blocked — setting absent",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(refund.status).toBe(403);
    const body = await refund.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("REFUNDS_DISABLED");
  });

  it("filters payments by business-local date boundaries", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash",
          customerId: "customer-wash",
          idempotencyKey: "date-filter-create-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash-5",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{ data: { id: string } }>();
    const jobId = created.data.id;

    const boundaryStart = "2026-07-22T18:30:00.000Z";
    const boundaryEnd = "2026-07-23T18:30:00.000Z";
    await env.DB.prepare(
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, tip_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, 'org-wash', 'branch-wash', ?, 'PAYMENT', 3000, 0, 'UPI', 'SUCCESS', NULL, ?, 'staff-wash', NULL, ?, ?)`,
    )
      .bind(
        "payment-date-filter-0001",
        jobId,
        boundaryStart,
        "date-filter-pay-0001",
        "2026-07-23T12:30:00.000Z",
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, tip_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, 'org-wash', 'branch-wash', ?, 'PAYMENT', 100, 0, 'CASH', 'SUCCESS', NULL, ?, 'staff-wash', NULL, ?, ?)`,
    )
      .bind(
        "payment-date-filter-0002",
        jobId,
        boundaryEnd,
        "date-filter-pay-0002",
        "2026-07-23T12:30:00.000Z",
      )
      .run();

    const within = await app.request(
      "/api/v1/payments?from=2026-07-23&to=2026-07-23",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(within.status).toBe(200);
    const withinBody = await within.json<{
      data: { id: string; wash_job_id: string }[];
    }>();
    const withinRows = withinBody.data.filter((r) => r.wash_job_id === jobId);
    expect(withinRows).toHaveLength(1);
    expect(
      withinRows.some((row) => row.id === "payment-date-filter-0001"),
    ).toBe(true);

    const nextDay = await app.request(
      "/api/v1/payments?from=2026-07-24&to=2026-07-24",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(nextDay.status).toBe(200);
    const nextDayBody = await nextDay.json<{
      data: { id: string; wash_job_id: string }[];
    }>();
    const nextDayRows = nextDayBody.data.filter((r) => r.wash_job_id === jobId);
    expect(nextDayRows).toHaveLength(1);
    expect(
      nextDayRows.some((row) => row.id === "payment-date-filter-0002"),
    ).toBe(true);

    const wide = await app.request(
      "/api/v1/payments?from=2026-07-20&to=2026-07-31",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(wide.status).toBe(200);
    const wideBody = await wide.json<{
      data: { id: string; wash_job_id: string }[];
    }>();
    expect(wideBody.data.filter((r) => r.wash_job_id === jobId)).toHaveLength(
      2,
    );
  });

  it("rejects invalid or reversed date ranges in the payments list", async () => {
    const headers = await mutationHeaders();
    const badDate = await app.request(
      "/api/v1/payments?from=2026-02-30&to=2026-07-23",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(badDate.status).toBe(422);
    expect((await badDate.json<{ error: { code: string } }>()).error.code).toBe(
      "VALIDATION_ERROR",
    );

    const reversed = await app.request(
      "/api/v1/payments?from=2026-07-24&to=2026-07-23",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(reversed.status).toBe(422);
    expect(
      (await reversed.json<{ error: { code: string } }>()).error.code,
    ).toBe("VALIDATION_ERROR");
  });

  it("filters payments by the assigned staff user ID", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "staff-wash-2",
          customerId: "customer-wash",
          idempotencyKey: "assigned-filter-create-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-live-wash-6",
          primaryServiceId: "service-primary",
          vehicleId: "vehicle-wash",
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json<{ data: { id: string } }>();

    const payment = await app.request(
      "/api/v1/payments",
      {
        body: JSON.stringify({
          amountMinor: 5000,
          idempotencyKey: "assigned-filter-pay-0001",
          method: "UPI",
          washJobId: created.data.id,
        }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(payment.status).toBe(201);

    const filtered = await app.request(
      "/api/v1/payments?assignedUserId=staff-wash-2",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(filtered.status).toBe(200);
    const filteredBody = await filtered.json<{
      data: {
        assigned_user_name_snapshot: string | null;
        id: string;
        wash_job_id: string;
      }[];
    }>();
    expect(filteredBody.data.length).toBeGreaterThan(0);
    expect(
      filteredBody.data.some((row) => row.wash_job_id === created.data.id),
    ).toBe(true);
    for (const row of filteredBody.data) {
      expect(row.assigned_user_name_snapshot).toBe("Shift B");
    }

    const otherStaff = await app.request(
      "/api/v1/payments?assignedUserId=staff-wash",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    const otherBody = await otherStaff.json<{
      data: { id: string; wash_job_id: string }[];
    }>();
    expect(
      otherBody.data.some((row) => row.wash_job_id === created.data.id),
    ).toBe(false);
  });

  it("rejects the UNASSIGNED sentinel as a validation error", async () => {
    const headers = await mutationHeaders();
    const response = await app.request(
      "/api/v1/payments?assignedUserId=UNASSIGNED",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(response.status).toBe(422);
    expect(
      (await response.json<{ error: { code: string } }>()).error.code,
    ).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown assigned staff IDs", async () => {
    const headers = await mutationHeaders();
    const response = await app.request(
      "/api/v1/payments?assignedUserId=missing-staff-1",
      { headers: { cookie: headers["cookie"] ?? "" } },
      env,
    );
    expect(response.status).toBe(404);
    expect(
      (await response.json<{ error: { code: string } }>()).error.code,
    ).toBe("RESOURCE_NOT_FOUND");
  });

  it("rejects filter parameters from staff members", async () => {
    await env.DB.prepare(
      "UPDATE users SET permissions_json = ? WHERE id = 'staff-wash-2'",
    )
      .bind(JSON.stringify(["payments.create", "wash_jobs.create"]))
      .run();
    const staffHeaders = { cookie: `__Host-washpro_session=${rawStaffToken}` };
    const unfiltered = await app.request("/api/v1/payments", {
      headers: staffHeaders,
    }, env);
    expect(unfiltered.status).toBe(200);
    for (const query of [
      "from=2026-07-23",
      "to=2026-07-23",
      "assignedUserId=staff-wash",
      "from=2026-07-01&to=2026-07-31&assignedUserId=staff-wash",
    ]) {
      const denied = await app.request(`/api/v1/payments?${query}`, {
        headers: staffHeaders,
      }, env);
      expect(denied.status).toBe(403);
      expect(
        (await denied.json<{ error: { code: string } }>()).error.code,
      ).toBe("AUTH_PERMISSION_DENIED");
    }
  });

  it("returns branch-scoped staff options for administrators", async () => {
    const headers = await mutationHeaders();
    const response = await app.request("/api/v1/payments/filter-options", {
      headers: { cookie: headers["cookie"] ?? "" },
    }, env);
    expect(response.status).toBe(200);
    const body = await response.json<{
      data: {
        assignedStaff: {
          active: boolean;
          id: string;
          name: string;
        }[];
      };
    }>();
    expect(body.data.assignedStaff.map((staff) => staff.name)).toEqual([
      "Retired Staff",
      "Shift B",
      "Wash Staff",
    ]);
    const byId = new Map(
      body.data.assignedStaff.map((staff) => [staff.id, staff]),
    );
    expect(byId.get("staff-wash")).toMatchObject({
      active: true,
      name: "Wash Staff",
    });
    expect(byId.get("staff-wash-2")).toMatchObject({
      active: true,
      name: "Shift B",
    });
    expect(byId.get("staff-wash-disabled")).toMatchObject({
      active: false,
      name: "Retired Staff",
    });
    expect(byId.has("admin-wash")).toBe(false);
  });

  it("denies filter options for staff members", async () => {
    const staffHeaders = { cookie: `__Host-washpro_session=${rawStaffToken}` };
    const denied = await app.request("/api/v1/payments/filter-options", {
      headers: staffHeaders,
    }, env);
    expect(denied.status).toBe(403);
    expect(
      (await denied.json<{ error: { code: string } }>()).error.code,
    ).toBe("AUTH_PERMISSION_DENIED");
  });
});
