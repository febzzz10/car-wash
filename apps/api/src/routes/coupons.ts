import { vehicleTypeCodeSchema } from "@washpro/contracts";
import { normalizeCode } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const couponSchema = z.object({
  code: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).optional(),
  discountType: z.enum(["FIXED", "PERCENTAGE"]),
  discountValue: z.number().int().positive(),
  eligibleServiceIds: z.array(z.string().min(8).max(64)).max(100).default([]),
  eligibleVehicleTypeCodes: z
    .array(vehicleTypeCodeSchema)
    .max(100)
    .default([]),
  expiresAt: z.iso.datetime({ offset: true }),
  maximumDiscountMinor: z.number().int().nonnegative().nullable().optional(),
  minimumBillMinor: z.number().int().nonnegative().default(0),
  newCustomersOnly: z.boolean().default(false),
  startAt: z.iso.datetime({ offset: true }),
  totalUsageLimit: z.number().int().positive().nullable().optional(),
  usageLimitPerCustomer: z.number().int().positive().nullable().optional(),
});
const couponPatchSchema = couponSchema
  .partial()
  .extend({ version: z.number().int().positive() });

async function resolveVehicleTypeIds(
  env: Env,
  organizationId: string,
  codes: readonly string[],
): Promise<string[]> {
  if (codes.length === 0) return [];
  const uniqueCodes = [...new Set(codes)];
  const placeholders = uniqueCodes.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id FROM vehicle_types WHERE organization_id = ? AND code IN (${placeholders}) AND is_active = 1`,
  )
    .bind(organizationId, ...uniqueCodes)
    .all<{ id: string }>();
  if (rows.results.length !== uniqueCodes.length)
    throw new ApiError(
      422,
      "COUPON_NOT_ELIGIBLE",
      "Select valid eligible vehicle types.",
    );
  return rows.results.map((r) => r.id);
}

async function assertEligibility(
  env: Env,
  organizationId: string,
  serviceIds: readonly string[],
): Promise<void> {
  const uniqueServices = [...new Set(serviceIds)];
  if (uniqueServices.length > 0) {
    const placeholders = uniqueServices.map(() => "?").join(",");
    const count =
      (await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM services WHERE organization_id = ? AND id IN (${placeholders})`,
      )
        .bind(organizationId, ...uniqueServices)
        .first<number>("count")) ?? 0;
    if (count !== uniqueServices.length)
      throw new ApiError(
        422,
        "COUPON_NOT_ELIGIBLE",
        "Select valid eligible services.",
      );
  }
}

export const couponRoutes = new Hono<AppBindings>();
couponRoutes.use("*", requireAdmin, requirePermission("coupons.manage"));

couponRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    `SELECT c.*,
      (SELECT COUNT(*) FROM coupon_eligible_services ces WHERE ces.coupon_id = c.id) AS eligible_service_count,
      (SELECT COUNT(*) FROM coupon_eligible_vehicle_types cevt WHERE cevt.coupon_id = c.id) AS eligible_vehicle_type_count,
      (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id AND cr.status = 'REDEEMED') AS redeemed_count
     FROM coupons c WHERE c.organization_id = ? ORDER BY c.created_at DESC`,
  )
    .bind(auth.organizationId)
    .all();
  return c.json({ data: result.results, success: true });
});

couponRoutes.post("/", async (c) => {
  const parsed = couponSchema.safeParse(await c.req.json().catch(() => null));
  if (
    !parsed.success ||
    Date.parse(parsed.data.expiresAt) <= Date.parse(parsed.data.startAt) ||
    (parsed.data.discountType === "PERCENTAGE" &&
      parsed.data.discountValue > 10_000)
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Check the coupon rules and date range.",
    );
  }
  const auth = c.get("auth");
  const eligibleVehicleTypeIds = await resolveVehicleTypeIds(
    c.env, auth.organizationId, parsed.data.eligibleVehicleTypeCodes,
  );
  await assertEligibility(
    c.env,
    auth.organizationId,
    parsed.data.eligibleServiceIds,
  );
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const code = normalizeCode(parsed.data.code);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO coupons (
      id, organization_id, code, code_normalized, description, discount_type,
      discount_value, minimum_bill_minor, maximum_discount_minor, start_at,
      expires_at, total_usage_limit, usage_limit_per_customer,
      new_customers_only, created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      auth.organizationId,
      code,
      code,
      parsed.data.description ?? null,
      parsed.data.discountType,
      parsed.data.discountValue,
      parsed.data.minimumBillMinor,
      parsed.data.maximumDiscountMinor ?? null,
      parsed.data.startAt,
      parsed.data.expiresAt,
      parsed.data.totalUsageLimit ?? null,
      parsed.data.usageLimitPerCustomer ?? null,
      parsed.data.newCustomersOnly ? 1 : 0,
      auth.userId,
      auth.userId,
      now,
      now,
    ),
    ...parsed.data.eligibleServiceIds.map((serviceId) =>
      c.env.DB.prepare(
        "INSERT INTO coupon_eligible_services (coupon_id, service_id) VALUES (?, ?)",
      ).bind(id, serviceId),
    ),
    ...eligibleVehicleTypeIds.map((vehicleTypeId) =>
      c.env.DB.prepare(
        "INSERT INTO coupon_eligible_vehicle_types (coupon_id, vehicle_type_id) VALUES (?, ?)",
      ).bind(id, vehicleTypeId),
    ),
    auditStatement(c.env, {
      action: "COUPON_CREATED",
      auth,
      next: { ...parsed.data, code },
      recordId: id,
      recordType: "COUPON",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }),
  ];
  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE"))
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "That normalized coupon code is already in use.",
      );
    throw error;
  }
  return c.json(
    {
      data: await c.env.DB.prepare("SELECT * FROM coupons WHERE id = ?")
        .bind(id)
        .first(),
      success: true,
    },
    201,
  );
});

couponRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const coupon = await c.env.DB.prepare(
    "SELECT * FROM coupons WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (coupon === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Coupon not found.");
  const [services, vehicleTypes, redemptions] = await Promise.all([
    c.env.DB.prepare(
      "SELECT service_id FROM coupon_eligible_services WHERE coupon_id = ?",
    )
      .bind(c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT vehicle_type_id FROM coupon_eligible_vehicle_types WHERE coupon_id = ?",
    )
      .bind(c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT cr.*, c.full_name AS customer_name, w.job_reference FROM coupon_redemptions cr INNER JOIN customers c ON c.id = cr.customer_id INNER JOIN wash_jobs w ON w.id = cr.wash_job_id WHERE cr.coupon_id = ? ORDER BY cr.reserved_at DESC",
    )
      .bind(c.req.param("id"))
      .all(),
  ]);
  return c.json({
    data: {
      ...coupon,
      eligibleServices: services.results,
      eligibleVehicleTypes: vehicleTypes.results,
      redemptions: redemptions.results,
    },
    success: true,
  });
});

couponRoutes.patch("/:id", async (c) => {
  const parsed = couponPatchSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (
    !parsed.success ||
    (parsed.data.startAt !== undefined &&
      parsed.data.expiresAt !== undefined &&
      Date.parse(parsed.data.expiresAt) <= Date.parse(parsed.data.startAt)) ||
    (parsed.data.discountType === "PERCENTAGE" &&
      (parsed.data.discountValue ?? 0) > 10_000)
  )
    throw new ApiError(422, "VALIDATION_ERROR", "Check the coupon changes.");
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT * FROM coupons WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Coupon not found.");
  const serviceIds = parsed.data.eligibleServiceIds;
  const vehicleTypeCodes = parsed.data.eligibleVehicleTypeCodes;
  const vehicleTypeIds = vehicleTypeCodes === undefined ? undefined : await resolveVehicleTypeIds(
    c.env, auth.organizationId, vehicleTypeCodes,
  );
  await assertEligibility(
    c.env,
    auth.organizationId,
    serviceIds ?? [],
  );
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE coupons SET
    code = COALESCE(?, code), code_normalized = COALESCE(?, code_normalized),
    description = CASE WHEN ? = 1 THEN ? ELSE description END,
    discount_type = COALESCE(?, discount_type), discount_value = COALESCE(?, discount_value),
    minimum_bill_minor = COALESCE(?, minimum_bill_minor),
    maximum_discount_minor = CASE WHEN ? = 1 THEN ? ELSE maximum_discount_minor END,
    start_at = COALESCE(?, start_at), expires_at = COALESCE(?, expires_at),
    total_usage_limit = CASE WHEN ? = 1 THEN ? ELSE total_usage_limit END,
    usage_limit_per_customer = CASE WHEN ? = 1 THEN ? ELSE usage_limit_per_customer END,
    new_customers_only = COALESCE(?, new_customers_only), updated_by_user_id = ?,
    updated_at = ?, version = version + 1
    WHERE id = ? AND organization_id = ? AND version = ?`,
  )
    .bind(
      parsed.data.code === undefined ? null : normalizeCode(parsed.data.code),
      parsed.data.code === undefined ? null : normalizeCode(parsed.data.code),
      parsed.data.description === undefined ? 0 : 1,
      parsed.data.description ?? null,
      parsed.data.discountType ?? null,
      parsed.data.discountValue ?? null,
      parsed.data.minimumBillMinor ?? null,
      parsed.data.maximumDiscountMinor === undefined ? 0 : 1,
      parsed.data.maximumDiscountMinor ?? null,
      parsed.data.startAt ?? null,
      parsed.data.expiresAt ?? null,
      parsed.data.totalUsageLimit === undefined ? 0 : 1,
      parsed.data.totalUsageLimit ?? null,
      parsed.data.usageLimitPerCustomer === undefined ? 0 : 1,
      parsed.data.usageLimitPerCustomer ?? null,
      parsed.data.newCustomersOnly === undefined
        ? null
        : parsed.data.newCustomersOnly
          ? 1
          : 0,
      auth.userId,
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
      "This coupon changed on another device.",
    );
  const statements: D1PreparedStatement[] = [];
  if (serviceIds !== undefined)
    statements.push(
      c.env.DB.prepare(
        "DELETE FROM coupon_eligible_services WHERE coupon_id = ?",
      ).bind(c.req.param("id")),
      ...serviceIds.map((value) =>
        c.env.DB.prepare(
          "INSERT INTO coupon_eligible_services (coupon_id, service_id) VALUES (?, ?)",
        ).bind(c.req.param("id"), value),
      ),
    );
  if (vehicleTypeIds !== undefined)
    statements.push(
      c.env.DB.prepare(
        "DELETE FROM coupon_eligible_vehicle_types WHERE coupon_id = ?",
      ).bind(c.req.param("id")),
      ...vehicleTypeIds.map((value) =>
        c.env.DB.prepare(
          "INSERT INTO coupon_eligible_vehicle_types (coupon_id, vehicle_type_id) VALUES (?, ?)",
        ).bind(c.req.param("id"), value),
      ),
    );
  statements.push(
    auditStatement(c.env, {
      action: "COUPON_UPDATED",
      auth,
      next: parsed.data,
      previous,
      recordId: c.req.param("id"),
      recordType: "COUPON",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }),
  );
  await c.env.DB.batch(statements);
  return c.json({
    data: await c.env.DB.prepare("SELECT * FROM coupons WHERE id = ?")
      .bind(c.req.param("id"))
      .first(),
    success: true,
  });
});

for (const [path, active] of [
  ["enable", 1],
  ["disable", 0],
] as const) {
  couponRoutes.post(`/:id/${path}`, async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      "UPDATE coupons SET is_active = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
    )
      .bind(
        active,
        auth.userId,
        new Date().toISOString(),
        c.req.param("id"),
        auth.organizationId,
      )
      .run();
    if (result.meta.changes === 0)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Coupon not found.");
    await auditStatement(c.env, {
      action: active === 1 ? "COUPON_ENABLED" : "COUPON_DISABLED",
      auth,
      recordId: c.req.param("id"),
      recordType: "COUPON",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }).run();
    return c.json({ data: { isActive: active === 1 }, success: true });
  });
}
