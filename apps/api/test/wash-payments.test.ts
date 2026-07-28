import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "wash-payment-integration-session";
const timestamp = "2026-07-23T12:30:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
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
      "INSERT OR IGNORE INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at) VALUES ('setting-referral-reward', 'org-wash', 'referral.reward_value', 'INTEGER', '500', ?)",
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
  it("finalizes referral rewards only after completion and full payment and exposes them to New Wash", async () => {
    const headers = await mutationHeaders();
    const createdResponse = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          assignedUserId: "admin-wash",
          customerId: "customer-referral-wash",
          idempotencyKey: "referral-wash-create-0001",
          initialStatus: "WAITING",
          location: {
            place: "Test Location, Kochi",
            capturedAt: new Date().toISOString(),
          },
          photoAssetId: "asset-referral-wash",
          primaryServiceId: "service-primary",
          referralCode: "RAVI500",
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
          amountMinor: created.data.total_amount_minor,
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
    const rewards = await app.request(
      "/api/v1/customers/referrer-wash/rewards",
      { headers: { cookie: headers.cookie ?? "" } },
      env,
    );
    expect(rewards.status).toBe(200);
    expect(await rewards.json()).toMatchObject({
      data: [
        {
          remaining_amount_minor: 500,
        },
      ],
      success: true,
    });
  });

  it("creates priced snapshots and preserves timer and financial integrity", async () => {
    const headers = await mutationHeaders();
    const create = await app.request(
      "/api/v1/wash-jobs",
      {
        body: JSON.stringify({
          addOnServiceIds: ["service-addon-1"],
          assignedUserId: "admin-wash",
          couponCode: " welcome-10 ",
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
      total_amount_minor: 12980,
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
    expect(
      await env.DB.prepare(
        "SELECT status FROM coupon_redemptions WHERE wash_job_id = ?",
      )
        .bind(created.data.id)
        .first("status"),
    ).toBe("REDEEMED");

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
      remainingBalanceMinor: 7980,
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
          amountMinor: 7980,
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
});
