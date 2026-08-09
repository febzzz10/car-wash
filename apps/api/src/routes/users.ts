import { PERMISSIONS } from "@washpro/contracts";
import {
  normalizeEmail,
  normalizeEmployeeCode,
  normalizePhone,
} from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { hashPassword, passwordPolicyError } from "../security/passwords";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const permissionSchema = z.enum(PERMISSIONS);
const createUserSchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/u, "Employee code can only contain letters, numbers, hyphens, underscores, and dots.")
    .optional(),
  fullName: z.string().trim().min(2).max(120),
  permissions: z.array(permissionSchema).max(PERMISSIONS.length).default([]),
  phone: z.string().trim().min(7).max(24).optional(),
  role: z.enum(["ADMIN", "STAFF"]),
  temporaryPassword: z.string().min(12).max(256),
  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[A-Za-z0-9._-]+$/u),
});
const patchUserSchema = createUserSchema
  .omit({ temporaryPassword: true, username: true })
  .partial()
  .extend({
    version: z.number().int().positive(),
  });
const statusSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
  version: z.number().int().positive(),
});
const resetSchema = z.object({
  temporaryPassword: z.string().min(12).max(256),
});

async function assertNotLastAdmin(
  env: Env,
  organizationId: string,
  userId: string,
): Promise<void> {
  const target = await env.DB.prepare(
    "SELECT role, status FROM users WHERE id = ? AND organization_id = ?",
  )
    .bind(userId, organizationId)
    .first<{ role: string; status: string }>();
  if (target?.role !== "ADMIN" || target.status !== "ACTIVE") return;
  const count =
    (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE organization_id = ? AND role = 'ADMIN' AND status = 'ACTIVE'",
    )
      .bind(organizationId)
      .first<number>("count")) ?? 0;
  if (count <= 1)
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "The last active Admin cannot be disabled or demoted.",
    );
}

export const userRoutes = new Hono<AppBindings>();
userRoutes.use("*", requireAdmin, requirePermission("users.manage"));

  userRoutes.get("/", async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      "SELECT id, default_branch_id, full_name, username, email, phone, employee_code, role, status, permissions_json, must_change_password, failed_login_count, locked_until, last_login_at, password_changed_at, disabled_at, disabled_reason, created_at, updated_at, version FROM users WHERE organization_id = ? ORDER BY CASE role WHEN 'ADMIN' THEN 0 ELSE 1 END, full_name",
    )
      .bind(auth.organizationId)
      .all();
    return c.json({ data: result.results, success: true });
  });

userRoutes.post("/", async (c) => {
  const parsed = createUserSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Check the Staff account details.",
    );
  const policyError = passwordPolicyError(parsed.data.temporaryPassword);
  if (policyError !== null)
    throw new ApiError(422, "VALIDATION_ERROR", policyError);
  const auth = c.get("auth");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(
    parsed.data.temporaryPassword,
    c.env.SESSION_PEPPER,
  );
  let phoneNormalized: string | null = null;
  if (parsed.data.phone !== undefined) {
    try {
      phoneNormalized = normalizePhone(parsed.data.phone);
    } catch {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Enter a valid phone number.",
      );
    }
  }
  let employeeCode: string | null = null;
  let employeeCodeNormalized: string | null = null;
  if (parsed.data.employeeCode !== undefined) {
    const normalized = normalizeEmployeeCode(parsed.data.employeeCode);
    if (normalized !== null) {
      employeeCode = normalized.name;
      employeeCodeNormalized = normalized.normalizedName;
    }
  }
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, email, email_normalized, phone, phone_normalized, employee_code, employee_code_normalized, password_hash, role, status, permissions_json, must_change_password, password_changed_at, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?, ?, ?)`,
      ).bind(
        id,
        auth.organizationId,
        auth.branchId,
        parsed.data.fullName.replace(/\s+/gu, " "),
        parsed.data.username,
        parsed.data.username.toLowerCase(),
        parsed.data.email ?? null,
        parsed.data.email === undefined
          ? null
          : normalizeEmail(parsed.data.email),
        parsed.data.phone ?? null,
        phoneNormalized,
        employeeCode,
        employeeCodeNormalized,
        passwordHash,
        parsed.data.role,
        JSON.stringify(parsed.data.permissions),
        now,
        auth.userId,
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "USER_CREATED",
        auth,
        next: {
          email: parsed.data.email,
          employeeCode,
          fullName: parsed.data.fullName,
          id,
          permissions: parsed.data.permissions,
          phone: parsed.data.phone,
          role: parsed.data.role,
          username: parsed.data.username,
        },
        recordId: id,
        recordType: "USER",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE"))
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The username, email, phone, or employee code is already in use.",
      );
    throw error;
  }
  const created = await c.env.DB.prepare(
    "SELECT id, default_branch_id, full_name, username, email, phone, employee_code, role, status, permissions_json, must_change_password, created_at, updated_at, version FROM users WHERE id = ?",
  )
    .bind(id)
    .first();
  return c.json({ data: created, success: true }, 201);
});

userRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const user = await c.env.DB.prepare(
    "SELECT id, default_branch_id, full_name, username, email, phone, employee_code, role, status, permissions_json, must_change_password, failed_login_count, locked_until, last_login_at, password_changed_at, disabled_at, disabled_reason, created_at, updated_at, version FROM users WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (user === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "User not found.");
  return c.json({ data: user, success: true });
});

userRoutes.patch("/:id", async (c) => {
  const parsed = patchUserSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the account changes.");
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT id, full_name, email, phone, employee_code, role, status, permissions_json, version FROM users WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "User not found.");
  if (previous.role === "ADMIN" && parsed.data.role === "STAFF")
    await assertNotLastAdmin(c.env, auth.organizationId, c.req.param("id"));
  let phoneNormalized: string | undefined;
  if (parsed.data.phone !== undefined) {
    try {
      phoneNormalized = normalizePhone(parsed.data.phone);
    } catch {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Enter a valid phone number.",
      );
    }
  }
  let employeeCode: string | null | undefined;
  let employeeCodeNormalized: string | null | undefined;
  if (parsed.data.employeeCode !== undefined) {
    const normalized = normalizeEmployeeCode(parsed.data.employeeCode);
    if (normalized !== null) {
      employeeCode = normalized.name;
      employeeCodeNormalized = normalized.normalizedName;
    } else {
      employeeCode = null;
      employeeCodeNormalized = null;
    }
  }
  const result = await c.env.DB.prepare(
    `UPDATE users SET full_name = COALESCE(?, full_name), email = CASE WHEN ? = 1 THEN ? ELSE email END, email_normalized = CASE WHEN ? = 1 THEN ? ELSE email_normalized END, phone = CASE WHEN ? = 1 THEN ? ELSE phone END, phone_normalized = CASE WHEN ? = 1 THEN ? ELSE phone_normalized END, employee_code = CASE WHEN ? = 1 THEN ? ELSE employee_code END, employee_code_normalized = CASE WHEN ? = 1 THEN ? ELSE employee_code_normalized END, role = COALESCE(?, role), permissions_json = COALESCE(?, permissions_json), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ?`,
  )
    .bind(
      parsed.data.fullName ?? null,
      parsed.data.email === undefined ? 0 : 1,
      parsed.data.email ?? null,
      parsed.data.email === undefined ? 0 : 1,
      parsed.data.email === undefined
        ? null
        : normalizeEmail(parsed.data.email),
      parsed.data.phone === undefined ? 0 : 1,
      parsed.data.phone ?? null,
      parsed.data.phone === undefined ? 0 : 1,
      phoneNormalized ?? null,
      parsed.data.employeeCode === undefined ? 0 : 1,
      employeeCode ?? null,
      parsed.data.employeeCode === undefined ? 0 : 1,
      employeeCodeNormalized ?? null,
      parsed.data.role ?? null,
      parsed.data.permissions === undefined
        ? null
        : JSON.stringify(parsed.data.permissions),
      new Date().toISOString(),
      c.req.param("id"),
      auth.organizationId,
      parsed.data.version,
    )
    .run();
  if (result.meta.changes === 0)
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "The account changed on another device.",
    );
  const updated = await c.env.DB.prepare(
    "SELECT id, full_name, email, phone, employee_code, role, status, permissions_json, version FROM users WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first();
  await auditStatement(c.env, {
    action: "USER_UPDATED",
    auth,
    next: updated,
    previous,
    recordId: c.req.param("id"),
    recordType: "USER",
    requestId: c.get("requestId"),
    severity: "WARNING",
  }).run();
  return c.json({ data: updated, success: true });
});

for (const [path, status, action] of [
  ["disable", "DISABLED", "USER_DISABLED"],
  ["enable", "ACTIVE", "USER_ENABLED"],
] as const) {
  userRoutes.post(`/:id/${path}`, async (c) => {
    const parsed = statusSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "A valid version number is required.",
      );
    const auth = c.get("auth");
    const reason =
      parsed.data.reason ||
      (status === "DISABLED"
        ? "Account disabled by administrator"
        : "Account enabled by administrator");
    if (status === "DISABLED")
      await assertNotLastAdmin(c.env, auth.organizationId, c.req.param("id"));
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE users SET status = ?, disabled_at = ?, disabled_by_user_id = ?, disabled_reason = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ?",
    )
      .bind(
        status,
        status === "DISABLED" ? now : null,
        status === "DISABLED" ? auth.userId : null,
        status === "DISABLED" ? reason : null,
        now,
        c.req.param("id"),
        auth.organizationId,
        parsed.data.version,
      )
      .run();
    if (result.meta.changes === 0)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The account could not be updated.",
      );
    if (status === "DISABLED")
      await c.env.DB.prepare(
        "UPDATE user_sessions SET status = 'REVOKED', revoked_at = ?, revoked_reason = 'ACCOUNT_DISABLED' WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'",
      )
        .bind(now, c.req.param("id"), auth.organizationId)
        .run();
    await auditStatement(c.env, {
      action,
      auth,
      reason,
      recordId: c.req.param("id"),
      recordType: "USER",
      requestId: c.get("requestId"),
      severity: "CRITICAL",
    }).run();
    return c.json({ data: { status }, success: true });
  });
}

userRoutes.post("/:id/reset-password", async (c) => {
  const parsed = resetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "A temporary password is required.",
    );
  const policyError = passwordPolicyError(parsed.data.temporaryPassword);
  if (policyError !== null)
    throw new ApiError(422, "VALIDATION_ERROR", policyError);
  const auth = c.get("auth");
  const hash = await hashPassword(
    parsed.data.temporaryPassword,
    c.env.SESSION_PEPPER,
  );
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, password_changed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
  )
    .bind(hash, now, now, c.req.param("id"), auth.organizationId)
    .run();
  if (result.meta.changes === 0)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "User not found.");
  await c.env.DB.prepare(
    "UPDATE user_sessions SET status = 'REVOKED', revoked_at = ?, revoked_reason = 'ADMIN_PASSWORD_RESET' WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'",
  )
    .bind(now, c.req.param("id"), auth.organizationId)
    .run();
  await auditStatement(c.env, {
    action: "PASSWORD_RESET",
    auth,
    reason: "Password changed by administrator",
    recordId: c.req.param("id"),
    recordType: "USER",
    requestId: c.get("requestId"),
    severity: "CRITICAL",
  }).run();
  return c.body(null, 204);
});

userRoutes.post("/:id/revoke-sessions", async (c) => {
  const auth = c.get("auth");
  const body: { reason?: string } = await c.req
    .json<{ reason?: string }>()
    .catch(() => ({}));
  const reason =
    typeof body.reason === "string" && body.reason.trim().length >= 5
      ? body.reason.trim()
      : "ADMIN_REVOCATION";
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE user_sessions SET status = 'REVOKED', revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'",
  )
    .bind(now, reason, c.req.param("id"), auth.organizationId)
    .run();
  await auditStatement(c.env, {
    action: "USER_SESSIONS_REVOKED",
    auth,
    reason,
    recordId: c.req.param("id"),
    recordType: "USER",
    requestId: c.get("requestId"),
    severity: "WARNING",
  }).run();
  return c.body(null, 204);
});

userRoutes.get("/:id/activity", async (c) => {
  const auth = c.get("auth");
  const user = await c.env.DB.prepare(
    "SELECT 1 FROM users WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (user === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "User not found.");
  const [audits, loginAttempts, sessions, washJobs] = await Promise.all([
    c.env.DB.prepare(
      "SELECT * FROM audit_logs WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 200",
    )
      .bind(auth.organizationId, c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT id, success, failure_reason, ip_address, user_agent, attempted_at FROM login_attempts WHERE organization_id = ? AND matched_user_id = ? ORDER BY attempted_at DESC LIMIT 100",
    )
      .bind(auth.organizationId, c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT id, status, ip_address, user_agent, device_name, created_at, last_seen_at, expires_at, revoked_at, revoked_reason FROM user_sessions WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(auth.organizationId, c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT id, job_reference, status, started_at, completed_at, total_active_seconds FROM wash_jobs WHERE organization_id = ? AND assigned_user_id = ? ORDER BY created_at DESC LIMIT 200",
    )
      .bind(auth.organizationId, c.req.param("id"))
      .all(),
  ]);
  return c.json({
    data: {
      audits: audits.results,
      loginAttempts: loginAttempts.results,
      sessions: sessions.results,
      washJobs: washJobs.results,
    },
    success: true,
  });
});
