import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "upload-test-session-token";
const timestamp = "2026-07-23T12:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-upload', 'Upload Test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-upload', 'org-upload', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('user-upload', 'org-upload', 'branch-upload', 'Upload User', 'upload', 'upload', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-upload', 'org-upload', 'user-upload', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
  ]);
});

async function mutationHeaders(): Promise<Record<string, string>> {
  return {
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

describe("private live-photo uploads", () => {
  it("requires a fresh camera challenge and stores only private validated objects", async () => {
    const headers = await mutationHeaders();
    const challengeResponse = await app.request(
      "/api/v1/uploads/photo-challenge",
      { headers, method: "POST" },
      env,
    );
    expect(challengeResponse.status).toBe(201);
    const { data: challenge } = await challengeResponse.json<{
      data: { expiresAt: string; nonce: string };
    }>();

    const galleryForm = new FormData();
    galleryForm.set("captureNonce", challenge.nonce);
    galleryForm.set("captureSource", "UPLOAD");
    galleryForm.set("capturedAt", new Date().toISOString());
    galleryForm.set("height", "480");
    galleryForm.set("width", "640");
    galleryForm.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "vehicle.jpg", {
        type: "image/jpeg",
      }),
    );
    const gallery = await app.request(
      "/api/v1/uploads/photo",
      { body: galleryForm, headers, method: "POST" },
      env,
    );
    expect(gallery.status).toBe(422);
    expect(await gallery.json()).toMatchObject({
      error: { code: "CAMERA_CAPTURE_REQUIRED" },
    });

    const forgedForm = new FormData();
    forgedForm.set("captureNonce", challenge.nonce);
    forgedForm.set("captureSource", "CAMERA");
    forgedForm.set("capturedAt", new Date().toISOString());
    forgedForm.set("height", "480");
    forgedForm.set("width", "640");
    forgedForm.set(
      "file",
      new File([new TextEncoder().encode("not-an-image")], "vehicle.jpg", {
        type: "image/jpeg",
      }),
    );
    const forged = await app.request(
      "/api/v1/uploads/photo",
      { body: forgedForm, headers, method: "POST" },
      env,
    );
    expect(forged.status).toBe(415);
    expect(await forged.json()).toMatchObject({
      error: { code: "UPLOAD_INVALID_TYPE" },
    });

    const validForm = new FormData();
    validForm.set("captureNonce", challenge.nonce);
    validForm.set("captureSource", "CAMERA");
    validForm.set("capturedAt", new Date().toISOString());
    validForm.set("height", "480");
    validForm.set("width", "640");
    validForm.set(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "vehicle.jpg", {
        type: "image/jpeg",
      }),
    );
    const uploaded = await app.request(
      "/api/v1/uploads/photo",
      { body: validForm, headers, method: "POST" },
      env,
    );
    expect(uploaded.status).toBe(201);
    const body = await uploaded.json<{
      data: { accessLevel: string; id: string; objectKey: string };
    }>();
    expect(body.data.accessLevel).toBe("PRIVATE");
    expect(await env.UPLOADS.get(body.data.objectKey)).not.toBeNull();

    const asset = await env.DB.prepare(
      "SELECT access_level, asset_type, upload_status FROM file_assets WHERE id = ?",
    )
      .bind(body.data.id)
      .first();
    expect(asset).toEqual({
      access_level: "PRIVATE",
      asset_type: "VEHICLE_LIVE_PHOTO",
      upload_status: "READY",
    });

    const directAccess = await app.request(
      `/api/v1/uploads/${body.data.id}`,
      { headers: { cookie: headers.cookie ?? "" } },
      env,
    );
    expect(directAccess.status).toBe(404);
  });
});
