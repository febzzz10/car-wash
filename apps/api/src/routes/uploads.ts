import { Hono } from "hono";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { randomToken } from "../security/encoding";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const maxPhotoBytes = 8 * 1024 * 1024;
const maxReceiptBytes = 15 * 1024 * 1024;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const receiptTypes = new Set([...photoTypes, "application/pdf"]);

interface Challenge {
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly sessionId: string;
}

function signatureMatches(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (mimeType === "image/webp") {
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (mimeType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  return false;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionFor(mimeType: string): string {
  return (
    {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[mimeType] ?? "bin"
  );
}

function integerField(form: FormData, name: string): number | null {
  const value = Number(form.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const uploadRoutes = new Hono<AppBindings>();

uploadRoutes.post(
  "/photo-challenge",
  requirePermission("wash_jobs.create"),
  async (c) => {
    const auth = c.get("auth");
    const nonce = randomToken(24);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const challenge: Challenge = {
      expiresAt: expiresAt.toISOString(),
      issuedAt: issuedAt.toISOString(),
      sessionId: auth.sessionId,
    };
    await c.env.CACHE.put(`capture:${nonce}`, JSON.stringify(challenge), {
      expirationTtl: 300,
    });
    return c.json(
      { data: { expiresAt: challenge.expiresAt, nonce }, success: true },
      201,
    );
  },
);

uploadRoutes.post(
  "/photo",
  requirePermission("wash_jobs.create"),
  async (c) => {
    const auth = c.get("auth");
    const form = await c.req.formData().catch(() => null);
    if (form === null || form.get("captureSource") !== "CAMERA") {
      throw new ApiError(
        422,
        "CAMERA_CAPTURE_REQUIRED",
        "Use the live camera to capture the required vehicle photo.",
      );
    }
    const nonce = form.get("captureNonce");
    const capturedAtText = form.get("capturedAt");
    const width = integerField(form, "width");
    const height = integerField(form, "height");
    const file = form.get("file");
    if (
      typeof nonce !== "string" ||
      typeof capturedAtText !== "string" ||
      width === null ||
      height === null ||
      !(file instanceof File)
    ) {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "The camera capture metadata is incomplete.",
      );
    }
    const challenge = await c.env.CACHE.get<Challenge>(
      `capture:${nonce}`,
      "json",
    );
    if (challenge === null || challenge.sessionId !== auth.sessionId) {
      throw new ApiError(
        422,
        "CAMERA_CAPTURE_REQUIRED",
        "The camera capture challenge expired. Retake the photo.",
      );
    }
    const capturedAt = Date.parse(capturedAtText);
    if (
      !Number.isFinite(capturedAt) ||
      capturedAt < Date.parse(challenge.issuedAt) - 30_000 ||
      capturedAt > Date.parse(challenge.expiresAt)
    ) {
      throw new ApiError(
        422,
        "CAMERA_CAPTURE_REQUIRED",
        "Retake the live photo before continuing.",
      );
    }
    if (!photoTypes.has(file.type)) {
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "Upload a JPEG, PNG, or WebP camera image.",
      );
    }
    if (file.size <= 0 || file.size > maxPhotoBytes) {
      throw new ApiError(
        413,
        "UPLOAD_TOO_LARGE",
        "The compressed photo must be 8 MB or smaller.",
      );
    }
    const buffer = await file.arrayBuffer();
    if (!signatureMatches(new Uint8Array(buffer), file.type)) {
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "The file contents do not match the image type.",
      );
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const objectKey = `${auth.organizationId}/${auth.branchId ?? "unassigned"}/vehicle-photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${extensionFor(file.type)}`;
    const checksum = await sha256Hex(buffer);
    try {
      await c.env.UPLOADS.put(objectKey, buffer, {
        customMetadata: { assetId: id, organizationId: auth.organizationId },
        httpMetadata: { contentType: file.type },
      });
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO file_assets (
          id, organization_id, branch_id, bucket_name, object_key,
          original_filename, mime_type, size_bytes, checksum_sha256,
          asset_type, access_level, upload_status, uploaded_by_user_id,
          created_at, ready_at, metadata_json
        ) VALUES (?, ?, ?, 'UPLOADS', ?, ?, ?, ?, ?, 'VEHICLE_LIVE_PHOTO',
          'PRIVATE', 'READY', ?, ?, ?, ?)`,
        ).bind(
          id,
          auth.organizationId,
          auth.branchId,
          objectKey,
          file.name.slice(0, 255),
          file.type,
          file.size,
          checksum,
          auth.userId,
          now.toISOString(),
          now.toISOString(),
          JSON.stringify({
            captureNonce: nonce,
            captureSource: "CAMERA",
            capturedAt: new Date(capturedAt).toISOString(),
            height,
            width,
          }),
        ),
        auditStatement(c.env, {
          action: "LIVE_PHOTO_UPLOADED",
          auth,
          next: {
            assetId: id,
            checksum,
            height,
            mimeType: file.type,
            sizeBytes: file.size,
            width,
          },
          recordId: id,
          recordType: "FILE_ASSET",
          requestId: c.get("requestId"),
        }),
      ]);
      await c.env.CACHE.delete(`capture:${nonce}`);
    } catch {
      await c.env.UPLOADS.delete(objectKey).catch(() => undefined);
      throw new ApiError(
        503,
        "UPLOAD_FAILED",
        "The photo could not be stored. Your form data is preserved; retry the upload.",
      );
    }
    return c.json(
      {
        data: {
          accessLevel: "PRIVATE",
          capturedAt: new Date(capturedAt).toISOString(),
          id,
          objectKey,
        },
        success: true,
      },
      201,
    );
  },
);

uploadRoutes.post(
  "/receipt",
  requirePermission("expenses.create"),
  async (c) => {
    const auth = c.get("auth");
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !receiptTypes.has(file.type))
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "Upload a PDF, JPEG, PNG, or WebP receipt.",
      );
    if (file.size <= 0 || file.size > maxReceiptBytes)
      throw new ApiError(
        413,
        "UPLOAD_TOO_LARGE",
        "The receipt must be 15 MB or smaller.",
      );
    const buffer = await file.arrayBuffer();
    if (!signatureMatches(new Uint8Array(buffer), file.type))
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "The file contents do not match the declared type.",
      );
    const id = crypto.randomUUID();
    const now = new Date();
    const objectKey = `${auth.organizationId}/${auth.branchId ?? "unassigned"}/expense-receipts/${now.getUTCFullYear()}/${id}.${extensionFor(file.type)}`;
    const checksum = await sha256Hex(buffer);
    try {
      await c.env.UPLOADS.put(objectKey, buffer, {
        httpMetadata: { contentType: file.type },
      });
      await c.env.DB.prepare(
        `INSERT INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, original_filename, mime_type, size_bytes, checksum_sha256, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at) VALUES (?, ?, ?, 'UPLOADS', ?, ?, ?, ?, ?, 'EXPENSE_RECEIPT', 'PRIVATE', 'READY', ?, ?, ?)`,
      )
        .bind(
          id,
          auth.organizationId,
          auth.branchId,
          objectKey,
          file.name.slice(0, 255),
          file.type,
          file.size,
          checksum,
          auth.userId,
          now.toISOString(),
          now.toISOString(),
        )
        .run();
    } catch {
      await c.env.UPLOADS.delete(objectKey).catch(() => undefined);
      throw new ApiError(
        503,
        "UPLOAD_FAILED",
        "The receipt could not be stored. Retry the upload.",
      );
    }
    return c.json({ data: { id, objectKey }, success: true }, 201);
  },
);

uploadRoutes.post(
  "/business-logo",
  requirePermission("settings.manage"),
  async (c) => {
    const auth = c.get("auth");
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png"].includes(file.type)
    )
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "Upload a PNG or JPEG business logo.",
      );
    if (file.size <= 0 || file.size > 5 * 1024 * 1024)
      throw new ApiError(
        413,
        "UPLOAD_TOO_LARGE",
        "The business logo must be 5 MB or smaller.",
      );
    const buffer = await file.arrayBuffer();
    if (!signatureMatches(new Uint8Array(buffer), file.type))
      throw new ApiError(
        415,
        "UPLOAD_INVALID_TYPE",
        "The logo contents do not match its image type.",
      );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const objectKey = `${auth.organizationId}/${auth.branchId ?? "unassigned"}/business-assets/${id}.${extensionFor(file.type)}`;
    try {
      await c.env.UPLOADS.put(objectKey, buffer, {
        customMetadata: { assetId: id, organizationId: auth.organizationId },
        httpMetadata: { contentType: file.type },
      });
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO file_assets (id, organization_id, branch_id, bucket_name, object_key, original_filename, mime_type, size_bytes, checksum_sha256, asset_type, access_level, upload_status, uploaded_by_user_id, created_at, ready_at) VALUES (?, ?, ?, 'UPLOADS', ?, ?, ?, ?, ?, 'BUSINESS_LOGO', 'PRIVATE', 'READY', ?, ?, ?)",
        ).bind(
          id,
          auth.organizationId,
          auth.branchId,
          objectKey,
          file.name.slice(0, 255),
          file.type,
          file.size,
          await sha256Hex(buffer),
          auth.userId,
          now,
          now,
        ),
        auditStatement(c.env, {
          action: "BUSINESS_LOGO_UPLOADED",
          auth,
          next: { assetId: id, mimeType: file.type, sizeBytes: file.size },
          recordId: id,
          recordType: "FILE_ASSET",
          requestId: c.get("requestId"),
        }),
      ]);
    } catch {
      await c.env.UPLOADS.delete(objectKey).catch(() => undefined);
      throw new ApiError(
        503,
        "UPLOAD_FAILED",
        "The logo could not be stored. Retry without losing settings.",
      );
    }
    return c.json(
      { data: { accessLevel: "PRIVATE", id, objectKey }, success: true },
      201,
    );
  },
);

uploadRoutes.get("/photos/:id", requirePermission("customers.read"), async (c) => {
  const auth = c.get("auth");
  const asset = await c.env.DB.prepare(
    `SELECT fa.object_key, fa.mime_type
     FROM file_assets fa
     INNER JOIN vehicle_photos vp ON vp.file_asset_id = fa.id
     WHERE vp.id = ? AND vp.organization_id = ?
       AND fa.upload_status = 'READY' AND fa.access_level = 'PRIVATE'`,
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<{ mime_type: string; object_key: string }>();
  if (asset === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Photo not found.");
  const object = await c.env.UPLOADS.get(asset.object_key);
  if (object === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Photo not found.");
  return new Response(object.body, {
    headers: {
      "Content-Type": asset.mime_type,
    },
  });
});

uploadRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const asset = await c.env.DB.prepare(
    "SELECT id, object_key, asset_type, uploaded_by_user_id FROM file_assets WHERE id = ? AND organization_id = ? AND upload_status IN ('PENDING', 'READY')",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<{
      asset_type: string;
      id: string;
      object_key: string;
      uploaded_by_user_id: string;
    }>();
  if (asset === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "File not found.");
  if (auth.role !== "ADMIN" && asset.uploaded_by_user_id !== auth.userId)
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "You cannot remove another user's upload.",
    );
  const linked = await c.env.DB.prepare(
    `SELECT 1 AS linked FROM vehicle_photos WHERE file_asset_id = ? UNION ALL SELECT 1 FROM expense_attachments WHERE file_asset_id = ? UNION ALL SELECT 1 FROM invoices WHERE pdf_asset_id = ? OR business_logo_asset_id = ? LIMIT 1`,
  )
    .bind(asset.id, asset.id, asset.id, asset.id)
    .first();
  if (linked !== null)
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "A linked file cannot be removed.",
    );
  await c.env.UPLOADS.delete(asset.object_key);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE file_assets SET upload_status = 'DELETED', deleted_at = ? WHERE id = ? AND organization_id = ?",
    ).bind(now, asset.id, auth.organizationId),
    auditStatement(c.env, {
      action: "UNLINKED_FILE_DELETED",
      auth,
      next: { assetType: asset.asset_type, status: "DELETED" },
      recordId: asset.id,
      recordType: "FILE_ASSET",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }),
  ]);
  return c.body(null, 204);
});
