import { customerInputSchema } from "@washpro/contracts";
import {
  normalizeEmail,
  normalizeNameSearch,
  normalizePhone,
  normalizeRegistration,
} from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { clientIp } from "../http/request";
import { requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const customerPatchSchema = customerInputSchema.partial().extend({
  version: z.number().int().positive(),
});
const statusChangeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().positive(),
});

function cleanCustomerInput(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;
  const record = input as Record<string, unknown>;
  return {
    ...record,
    ...(typeof record.email === "string" ? { email: record.email.trim() } : {}),
  };
}

function isUniqueFailure(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}

export const customerRoutes = new Hono<AppBindings>();

customerRoutes.get("/", requirePermission("customers.read"), async (c) => {
  const auth = c.get("auth");
  const query = c.req.query("search")?.trim() ?? "";
  const status = c.req.query("status") === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const like = `%${query.toLocaleLowerCase("en-IN").replace(/\s+/gu, " ")}%`;
  const digits = query.replace(/\D/gu, "");
  const phoneLike = digits === "" ? "" : `%${digits}%`;
  let registrationSearch: string | null = null;
  if (query.length > 0) {
    try {
      registrationSearch = normalizeRegistration(query).search;
    } catch {
      registrationSearch = null;
    }
  }
  const result = await c.env.DB.prepare(
    `SELECT id, customer_code, full_name, phone, phone_normalized, email,
      address, notes, status, registered_at, last_visit_at,
      total_visits_cached, total_spent_minor_cached, created_at, updated_at, version
    FROM customers
    WHERE organization_id = ? AND status = ?
      AND (
        ? = ''
        OR name_search LIKE ?
        OR (? <> '' AND replace(phone_normalized, '+', '') LIKE ?)
        OR (? IS NOT NULL AND EXISTS (
          SELECT 1 FROM vehicles v
          WHERE v.organization_id = customers.organization_id
            AND v.customer_id = customers.id
            AND v.registration_normalized = ?
        ))
      )
    ORDER BY COALESCE(last_visit_at, registered_at) DESC
    LIMIT 100`,
  )
    .bind(
      auth.organizationId,
      status,
      query,
      like,
      phoneLike,
      phoneLike,
      registrationSearch,
      registrationSearch,
    )
    .all();
  const matchingRegistrations = new Map<string, string[]>();
  if (registrationSearch !== null) {
    const matches = await c.env.DB.prepare(
      `SELECT customer_id, registration_number FROM vehicles
       WHERE organization_id = ? AND registration_normalized = ?`,
    )
      .bind(auth.organizationId, registrationSearch)
      .all();
    for (const row of matches.results) {
      const customerId = row.customer_id as string;
      const registrations = matchingRegistrations.get(customerId) ?? [];
      registrations.push(row.registration_number as string);
      matchingRegistrations.set(customerId, registrations);
    }
  }
  const data = result.results.map((row) => {
    const registrations = matchingRegistrations.get(row.id as string);
    return registrations === undefined
      ? row
      : { ...row, matching_registrations: registrations };
  });
  return c.json({ data, success: true });
});

customerRoutes.post("/", requirePermission("customers.create"), async (c) => {
  const parsed = customerInputSchema.safeParse(
    cleanCustomerInput(await c.req.json().catch(() => null)),
  );
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Check the customer details.");
  }
  const auth = c.get("auth");
  const id = crypto.randomUUID();
  const referralCode = `WP${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const fullName = parsed.data.fullName.replace(/\s+/gu, " ").trim();
  let phoneNormalized: string;
  try {
    phoneNormalized = normalizePhone(parsed.data.phone);
  } catch (error) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Enter a valid phone number.",
    );
  }
  const record = {
    address: parsed.data.address ?? null,
    email: parsed.data.email || null,
    fullName,
    id,
    notes: parsed.data.notes ?? null,
    phone: parsed.data.phone.trim(),
    phoneNormalized,
  };

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO customers (
          id, organization_id, home_branch_id, full_name, name_search, phone,
          phone_normalized, email, email_normalized, address, notes,
          registration_source, registered_at, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        auth.organizationId,
        auth.branchId,
        fullName,
        normalizeNameSearch(fullName),
        record.phone,
        phoneNormalized,
        record.email,
        record.email === null ? null : normalizeEmail(record.email),
        record.address,
        record.notes,
        auth.role,
        now,
        auth.userId,
        auth.userId,
        now,
        now,
      ),
      c.env.DB.prepare(
        `INSERT INTO referral_codes (
          id, organization_id, customer_id, code, code_normalized, status,
          issued_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        auth.organizationId,
        id,
        referralCode,
        referralCode,
        now,
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "CUSTOMER_CREATED",
        auth,
        ipAddress: clientIp(c),
        next: record,
        recordId: id,
        recordType: "CUSTOMER",
        requestId: c.get("requestId"),
        userAgent: c.req.header("user-agent") ?? null,
      }),
    ]);
  } catch (error) {
    if (isUniqueFailure(error)) {
      throw new ApiError(
        409,
        "DUPLICATE_CUSTOMER",
        "A customer with this phone number already exists.",
      );
    }
    throw error;
  }

  const created = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ? AND organization_id = ?",
  )
    .bind(id, auth.organizationId)
    .first();
  return c.json({ data: created, success: true }, 201);
});

customerRoutes.get("/:id", requirePermission("customers.read"), async (c) => {
  const auth = c.get("auth");
  const customer = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (customer === null) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Customer not found.");
  }
  const [vehicles, reward] = await Promise.all([
    c.env.DB.prepare(
      `SELECT v.*, vt.name AS vehicle_type_name FROM vehicles v
       INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
       WHERE v.customer_id = ? AND v.organization_id = ? ORDER BY v.created_at DESC`,
    )
      .bind(c.req.param("id"), auth.organizationId)
      .all(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE
        WHEN transaction_type IN ('EARN', 'RELEASE', 'ADMIN_ADJUSTMENT') THEN amount_minor
        WHEN transaction_type IN ('RESERVE', 'REDEEM', 'EXPIRE', 'CANCEL') THEN -amount_minor
        ELSE 0 END), 0) AS balance_minor
       FROM referral_reward_transactions WHERE customer_id = ?`,
    )
      .bind(c.req.param("id"))
      .first(),
  ]);
  return c.json({
    data: { ...customer, rewardBalance: reward, vehicles: vehicles.results },
    success: true,
  });
});

customerRoutes.patch(
  "/:id",
  requirePermission("customers.update"),
  async (c) => {
    const parsed = customerPatchSchema.safeParse(
      cleanCustomerInput(await c.req.json().catch(() => null)),
    );
    if (!parsed.success) {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Check the customer details.",
      );
    }
    const auth = c.get("auth");
    const previous = await c.env.DB.prepare(
      "SELECT * FROM customers WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<Record<string, unknown>>();
    if (previous === null) {
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Customer not found.");
    }
    const fullName = parsed.data.fullName?.replace(/\s+/gu, " ").trim();
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
    const now = new Date().toISOString();
    try {
      const result = await c.env.DB.prepare(
        `UPDATE customers SET
        full_name = COALESCE(?, full_name), name_search = COALESCE(?, name_search),
        phone = COALESCE(?, phone), phone_normalized = COALESCE(?, phone_normalized),
        email = CASE WHEN ? = 1 THEN ? ELSE email END,
        email_normalized = CASE WHEN ? = 1 THEN ? ELSE email_normalized END,
        address = CASE WHEN ? = 1 THEN ? ELSE address END,
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        updated_by_user_id = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND organization_id = ? AND version = ?`,
      )
        .bind(
          fullName ?? null,
          fullName === undefined ? null : normalizeNameSearch(fullName),
          parsed.data.phone ?? null,
          phoneNormalized ?? null,
          parsed.data.email === undefined ? 0 : 1,
          parsed.data.email || null,
          parsed.data.email === undefined ? 0 : 1,
          parsed.data.email ? normalizeEmail(parsed.data.email) : null,
          parsed.data.address === undefined ? 0 : 1,
          parsed.data.address ?? null,
          parsed.data.notes === undefined ? 0 : 1,
          parsed.data.notes ?? null,
          auth.userId,
          now,
          c.req.param("id"),
          auth.organizationId,
          parsed.data.version,
        )
        .run();
      if (result.meta.changes === 0) {
        throw new ApiError(
          409,
          "RESOURCE_CONFLICT",
          "This customer changed on another device. Reload and try again.",
        );
      }
    } catch (error) {
      if (isUniqueFailure(error)) {
        throw new ApiError(
          409,
          "DUPLICATE_CUSTOMER",
          "That phone number is already in use.",
        );
      }
      throw error;
    }
    const updated = await c.env.DB.prepare(
      "SELECT * FROM customers WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first();
    await auditStatement(c.env, {
      action: "CUSTOMER_UPDATED",
      auth,
      next: updated,
      previous,
      recordId: c.req.param("id"),
      recordType: "CUSTOMER",
      requestId: c.get("requestId"),
    }).run();
    return c.json({ data: updated, success: true });
  },
);

for (const [path, nextStatus, action] of [
  ["deactivate", "INACTIVE", "CUSTOMER_DEACTIVATED"],
  ["reactivate", "ACTIVE", "CUSTOMER_REACTIVATED"],
] as const) {
  customerRoutes.post(
    `/:id/${path}`,
    requirePermission("customers.deactivate"),
    async (c) => {
      const parsed = statusChangeSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success) {
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "A reason and current version are required.",
        );
      }
      const auth = c.get("auth");
      const now = new Date().toISOString();
      const result = await c.env.DB.prepare(
        `UPDATE customers SET status = ?, deactivated_at = ?, deactivated_by_user_id = ?,
          deactivation_reason = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND organization_id = ? AND version = ?`,
      )
        .bind(
          nextStatus,
          nextStatus === "INACTIVE" ? now : null,
          nextStatus === "INACTIVE" ? auth.userId : null,
          nextStatus === "INACTIVE" ? parsed.data.reason : null,
          auth.userId,
          now,
          c.req.param("id"),
          auth.organizationId,
          parsed.data.version,
        )
        .run();
      if (result.meta.changes === 0) {
        throw new ApiError(
          409,
          "RESOURCE_CONFLICT",
          "The customer could not be updated.",
        );
      }
      await auditStatement(c.env, {
        action,
        auth,
        reason: parsed.data.reason,
        recordId: c.req.param("id"),
        recordType: "CUSTOMER",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }).run();
      return c.json({ data: { status: nextStatus }, success: true });
    },
  );
}

customerRoutes.get(
  "/:id/rewards",
  requirePermission("wash_jobs.create"),
  async (c) => {
    const auth = c.get("auth");
    const washJobId = c.req.query("washJobId");
    const customer = await c.env.DB.prepare(
      "SELECT 1 FROM customers WHERE id = ? AND organization_id = ? AND status = 'ACTIVE'",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first();
    if (customer === null)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Active customer not found.",
      );
    const result = await c.env.DB.prepare(
      `SELECT id, original_amount_minor, remaining_amount_minor, available_from,
        expires_at, referral_redemption_id AS source_referral_redemption_id,
        version
       FROM referral_rewards
       WHERE organization_id = ? AND customer_id = ?
         AND (
           (status = 'AVAILABLE' AND reserved_for_wash_job_id IS NULL)
           OR (status = 'RESERVED' AND reserved_for_wash_job_id = ?)
         )
         AND remaining_amount_minor > 0
         AND (available_from IS NULL OR available_from <= ?)
         AND (expires_at IS NULL OR expires_at >= ?)
       ORDER BY COALESCE(expires_at, '9999-12-31T23:59:59.999Z'), created_at`,
    )
      .bind(
        auth.organizationId,
        c.req.param("id"),
        washJobId ?? null,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .all();
    return c.json({ data: result.results, success: true });
  },
);

customerRoutes.get(
  "/:id/wash-jobs",
  requirePermission("customers.read"),
  async (c) => {
    const auth = c.get("auth");
    const customerId = c.req.param("id");
    const limit = Math.min(Math.max(1, Number(c.req.query("limit")) || 20), 100);
    const cursor = c.req.query("cursor");
    let cursorCreatedAt: string | undefined;
    let cursorId: string | undefined;
    if (cursor !== undefined) {
      try {
        const decoded = atob(cursor);
        const sep = decoded.lastIndexOf("|");
        if (sep !== -1) {
          cursorCreatedAt = decoded.slice(0, sep);
          cursorId = decoded.slice(sep + 1);
        }
      } catch {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
      }
    }
    const rows = await c.env.DB.prepare(
      cursorCreatedAt !== undefined && cursorId !== undefined
        ? `SELECT * FROM wash_jobs
           WHERE organization_id = ? AND customer_id = ?
             AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC
           LIMIT ?`
        : `SELECT * FROM wash_jobs
           WHERE organization_id = ? AND customer_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
    )
      .bind(
        auth.organizationId,
        customerId,
        ...(cursorCreatedAt !== undefined && cursorId !== undefined
          ? [cursorCreatedAt, cursorCreatedAt, cursorId, limit]
          : [limit]),
      )
      .all();
    const jobs = rows.results;
    const nextCursor =
      jobs.length === limit
        ? btoa(
            `${(jobs[jobs.length - 1] as Record<string, unknown>).created_at as string}|${(jobs[jobs.length - 1] as Record<string, unknown>).id as string}`,
          )
        : null;
    return c.json({
      data: { jobs, hasMore: nextCursor !== null, nextCursor },
      success: true,
    });
  },
);

customerRoutes.get(
  "/:id/history",
  requirePermission("customers.read"),
  async (c) => {
    const auth = c.get("auth");
    const customerId = c.req.param("id");
    const exists = await c.env.DB.prepare(
      "SELECT 1 FROM customers WHERE id = ? AND organization_id = ?",
    )
      .bind(customerId, auth.organizationId)
      .first();
    if (exists === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Customer not found.");
    const [
      invoices,
      payments,
      coupons,
      referrals,
      photos,
      locations,
    ] = await Promise.all([
      c.env.DB.prepare(
        "SELECT i.* FROM invoices i INNER JOIN wash_jobs w ON w.id = i.wash_job_id WHERE w.customer_id = ? AND i.organization_id = ? ORDER BY i.created_at DESC",
      )
        .bind(customerId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT p.* FROM payments p INNER JOIN wash_jobs w ON w.id = p.wash_job_id WHERE w.customer_id = ? AND p.organization_id = ? ORDER BY p.created_at DESC",
      )
        .bind(customerId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT cr.* FROM coupon_redemptions cr INNER JOIN coupons cpn ON cpn.id = cr.coupon_id WHERE cr.customer_id = ? AND cpn.organization_id = ? ORDER BY cr.reserved_at DESC",
      )
        .bind(customerId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT * FROM referral_redemptions WHERE organization_id = ? AND (referring_customer_id = ? OR referred_customer_id = ?) ORDER BY created_at DESC",
      )
        .bind(auth.organizationId, customerId, customerId)
        .all(),
      c.env.DB.prepare(
        "SELECT * FROM vehicle_photos WHERE customer_id = ? AND organization_id = ? ORDER BY created_at DESC",
      )
        .bind(customerId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT lc.* FROM location_captures lc INNER JOIN wash_jobs w ON w.id = lc.wash_job_id WHERE w.customer_id = ? AND lc.organization_id = ? ORDER BY lc.captured_at DESC",
      )
        .bind(customerId, auth.organizationId)
        .all(),
    ]);
    return c.json({
      data: {
        coupons: coupons.results,
        invoices: invoices.results,
        locations: locations.results,
        payments: payments.results,
        photos: photos.results,
        referrals: referrals.results,
      },
      success: true,
    });
  },
);

customerRoutes.get(
  "/:id/referrals",
  requirePermission("customers.read"),
  async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      `SELECT rr.*, rc.code AS referral_code
     FROM referral_redemptions rr
     INNER JOIN referral_codes rc ON rc.id = rr.referral_code_id
     WHERE rr.organization_id = ? AND (rr.referring_customer_id = ? OR rr.referred_customer_id = ?)
     ORDER BY rr.created_at DESC`,
    )
      .bind(auth.organizationId, c.req.param("id"), c.req.param("id"))
      .all();
    return c.json({ data: result.results, success: true });
  },
);
