import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "vehicle-photos-session";
const staffToken = "vehicle-photos-staff";
const staffNoPermissionToken = "vehicle-photos-staff-none";
const timestamp = "2026-08-01T10:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  const staffTokenHash = await hashSessionToken(staffToken, env.SESSION_PEPPER);
  const staffNoPermissionTokenHash = await hashSessionToken(staffNoPermissionToken, env.SESSION_PEPPER);
  await env.UPLOADS.put("vp-asset-a.jpg", new Uint8Array([1, 2, 3, 4]));
  await env.UPLOADS.put("vp-asset-b.jpg", new Uint8Array([5, 6, 7, 8]));
  await env.UPLOADS.put("vp-asset-other-org.jpg", new Uint8Array([9, 9, 9, 9]));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vehicle_photos"),
    env.DB.prepare("DELETE FROM user_sessions"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-vp', 'Vehicle Photo Test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-vp', 'org-vp', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-vp', 'org-vp', 'branch-vp', 'VP Admin', 'vp-admin', 'vp-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-vp', 'org-vp', 'branch-vp', 'VP Staff', 'vp-staff', 'vp-staff', 'unused', 'STAFF', 'ACTIVE', '[\"customers.read\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, permissions_json, created_at, updated_at) VALUES ('staff-vp-none', 'org-vp', 'branch-vp', 'VP Staff No Read', 'vp-staff-none', 'vp-staff-none', 'unused', 'STAFF', 'ACTIVE', '[\"wash_jobs.create\"]', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-vp', 'org-vp', 'admin-vp', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-vp-staff', 'org-vp', 'staff-vp', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-vp-staff-none', 'org-vp', 'staff-vp-none', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(staffNoPermissionTokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('vt-vp', 'org-vp', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES ('customer-vp', 'org-vp', 'branch-vp', 'Test Customer', 'test customer', '9999999901', '9999999901', ?, 'ACTIVE', 0, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES ('customer-vp-other', 'org-vp', 'branch-vp', 'Other Customer', 'other customer', '9999999902', '9999999902', ?, 'ACTIVE', 0, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES ('vehicle-vp', 'org-vp', 'customer-vp', 'vt-vp', 'VP-01', 'VP01', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES ('vehicle-vp-other', 'org-vp', 'customer-vp-other', 'vt-vp', 'VP-02', 'VP02', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, created_at) VALUES ('fa-vp-a', 'org-vp', 'branch-vp', 'UPLOADS', 'vp-asset-a.jpg', 'image/jpeg', 1234567, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', ?) ON CONFLICT (id) DO UPDATE SET upload_status = 'READY', access_level = 'PRIVATE'",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, created_at) VALUES ('fa-vp-b', 'org-vp', 'branch-vp', 'UPLOADS', 'vp-asset-b.jpg', 'image/jpeg', 2048, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, created_at) VALUES ('fa-vp-deleted', 'org-vp', 'branch-vp', 'UPLOADS', 'vp-asset-b.jpg', 'image/jpeg', 1024, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'DELETED', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-other-vp', 'Other Org', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-other-vp', 'org-other-vp', 'MAIN', 'Other', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicle_types (id, organization_id, code, name, created_at, updated_at) VALUES ('vt-other-vp', 'org-other-vp', 'FOUR_WHEELER', 'Four Wheeler', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO customers (id, organization_id, home_branch_id, full_name, name_search, phone, phone_normalized, registered_at, status, total_visits_cached, created_at, updated_at) VALUES ('customer-other-vp', 'org-other-vp', 'branch-other-vp', 'Other Org Customer', 'other org customer', '9999999903', '9999999903', ?, 'ACTIVE', 0, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO vehicles (id, organization_id, customer_id, vehicle_type_id, registration_number, registration_normalized, status, created_at, updated_at) VALUES ('vehicle-other-vp', 'org-other-vp', 'customer-other-vp', 'vt-other-vp', 'OTHER-01', 'OTHER01', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, mime_type, size_bytes, asset_type, access_level, upload_status, created_at) VALUES ('fa-vp-other-org', 'org-other-vp', 'branch-other-vp', 'UPLOADS', 'vp-asset-other-org.jpg', 'image/jpeg', 999, 'VEHICLE_LIVE_PHOTO', 'PRIVATE', 'READY', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, assigned_user_name_snapshot, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, status, subtotal_minor, total_amount_minor, balance_minor, tax_rate_basis_points, mandatory_photo_verified, mandatory_location_verified, created_by_user_id, updated_by_user_id, created_at, updated_at) VALUES ('job-vp', 'org-vp', 'branch-vp', 'WP-TEST-0001', 'customer-vp', 'vehicle-vp', 'staff-vp', 'VP Staff', 'Test', '000', 'VP-01', 'Four Wheeler', 'COMPLETED', 5000, 5000, 5000, 0, 1, 0, 'admin-vp', 'admin-vp', ?, ?)",
    ).bind(timestamp, timestamp),
  ]);
});

async function adminHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

async function staffHeaders(raw: string): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${raw}`,
  };
}

async function insertVehiclePhoto(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = (overrides.id as string) ?? `vp-photo-${Math.random().toString(36).slice(2)}`;
  await env.DB.prepare(
    `INSERT INTO vehicle_photos (id, organization_id, wash_job_id, vehicle_id, customer_id, file_asset_id, photo_type, capture_source, is_mandatory_capture, captured_at, captured_by_user_id, width_pixels, height_pixels, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CAMERA', 1, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    overrides.organization_id ?? "org-vp",
    overrides.wash_job_id ?? "job-vp",
    overrides.vehicle_id ?? "vehicle-vp",
    overrides.customer_id ?? "customer-vp",
    overrides.file_asset_id ?? "fa-vp-a",
    overrides.photo_type ?? "LIVE_BEFORE_WASH",
    overrides.captured_at ?? timestamp,
    overrides.captured_by_user_id ?? "staff-vp",
    overrides.width_pixels ?? 1920,
    overrides.height_pixels ?? 1080,
    timestamp,
  ).run();
  return id;
}

describe("vehicle photos — customer history", () => {
  it("A. history photos are enriched with size, registration, and job reference", async () => {
    const photoId = await insertVehiclePhoto({
      captured_at: "2026-08-01T09:00:00.000Z",
      file_asset_id: "fa-vp-a",
    });
    const response = await app.request(
      "/api/v1/customers/customer-vp/history",
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { photos: Record<string, unknown>[] } }>();
    expect(body.data.photos).toHaveLength(1);
    expect(body.data.photos[0]).toMatchObject({
      id: photoId,
      job_reference: "WP-TEST-0001",
      location_place: null,
      mime_type: "image/jpeg",
      photo_type: "LIVE_BEFORE_WASH",
      registration_number: "VP-01",
      size_bytes: 1234567,
    });
  });

  it("B. photos are ordered newest first", async () => {
    await insertVehiclePhoto({ captured_at: "2026-07-01T09:00:00.000Z" });
    await insertVehiclePhoto({ captured_at: "2026-08-01T09:00:00.000Z" });
    const response = await app.request(
      "/api/v1/customers/customer-vp/history",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{ data: { photos: { captured_at: string }[] } }>();
    expect(body.data.photos.map((photo) => photo.captured_at)).toEqual([
      "2026-08-01T09:00:00.000Z",
      "2026-07-01T09:00:00.000Z",
    ]);
  });

  it("C. photos of another customer's vehicle are excluded", async () => {
    await insertVehiclePhoto({
      customer_id: "customer-vp-other",
      vehicle_id: "vehicle-vp-other",
    });
    const response = await app.request(
      "/api/v1/customers/customer-vp/history",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{ data: { photos: unknown[] } }>();
    expect(body.data.photos).toHaveLength(0);
  });

  it("D. photos whose file asset is not READY are excluded", async () => {
    await insertVehiclePhoto();
    await env.DB.prepare("UPDATE file_assets SET upload_status = 'DELETED' WHERE id = 'fa-vp-a'").run();
    const response = await app.request(
      "/api/v1/customers/customer-vp/history",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{ data: { photos: unknown[] } }>();
    expect(body.data.photos).toHaveLength(0);
  });

  it("D2. includes wash job location_place when set", async () => {
    await env.DB.prepare(
      "UPDATE wash_jobs SET location_place = 'Kottarakkara, Kollam' WHERE id = 'job-vp'",
    ).run();
    await insertVehiclePhoto();
    const response = await app.request(
      "/api/v1/customers/customer-vp/history",
      { headers: await adminHeaders() },
      env,
    );
    const body = await response.json<{ data: { photos: Record<string, unknown>[] } }>();
    expect(body.data.photos).toHaveLength(1);
    expect(body.data.photos[0]!.location_place).toBe("Kottarakkara, Kollam");
  });
});

describe("vehicle photos — secure bytes endpoint", () => {
  it("E. serves photo bytes to an admin", async () => {
    const photoId = await insertVehiclePhoto();
    const response = await app.request(
      `/api/v1/uploads/photos/${photoId}`,
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
  });

  it("F. serves photo bytes to staff with customers.read", async () => {
    const photoId = await insertVehiclePhoto();
    const response = await app.request(
      `/api/v1/uploads/photos/${photoId}`,
      { headers: await staffHeaders(staffToken) },
      env,
    );
    expect(response.status).toBe(200);
  });

  it("G. rejects staff without customers.read", async () => {
    const photoId = await insertVehiclePhoto();
    const response = await app.request(
      `/api/v1/uploads/photos/${photoId}`,
      { headers: await staffHeaders(staffNoPermissionToken) },
      env,
    );
    expect(response.status).toBe(403);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("AUTH_PERMISSION_DENIED");
  });

  it("H. rejects unauthenticated requests", async () => {
    const response = await app.request("/api/v1/uploads/photos/whatever", {}, env);
    expect(response.status).toBe(401);
  });

  it("I. returns 404 for a photo from another organization", async () => {
    const otherOrgPhotoId = await insertVehiclePhoto({
      organization_id: "org-other-vp",
      customer_id: "customer-other-vp",
      vehicle_id: "vehicle-other-vp",
      file_asset_id: "fa-vp-other-org",
      wash_job_id: null,
    });
    const response = await app.request(
      `/api/v1/uploads/photos/${otherOrgPhotoId}`,
      { headers: await adminHeaders() },
      env,
    );
    expect(response.status).toBe(404);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("J. returns 404 for unknown or missing photo ids", async () => {
    const missing = await app.request(
      "/api/v1/uploads/photos/does-not-exist",
      { headers: await adminHeaders() },
      env,
    );
    expect(missing.status).toBe(404);
    const deletedPhotoId = await insertVehiclePhoto();
    await env.DB.prepare("UPDATE file_assets SET upload_status = 'DELETED' WHERE id = 'fa-vp-a'").run();
    const deleted = await app.request(
      `/api/v1/uploads/photos/${deletedPhotoId}`,
      { headers: await adminHeaders() },
      env,
    );
    expect(deleted.status).toBe(404);
  });
});
