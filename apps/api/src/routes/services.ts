import { vehicleTypeCodeSchema } from "@washpro/contracts";
import { normalizeCode } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const serviceSchema = z.object({
  basePriceMinor: z.number().int().nonnegative().default(0),
  category: z.string().trim().max(80).optional(),
  code: z.string().trim().min(2).max(40),
  description: z.string().trim().max(1000).optional(),
  displayOrder: z.number().int().default(0),
  estimatedDurationMinutes: z.number().int().nonnegative().optional(),
  isTaxable: z.boolean().default(false),
  name: z.string().trim().min(2).max(120),
  serviceKind: z.enum(["PRIMARY", "ADD_ON"]),
  taxRateBasisPoints: z.number().int().min(0).max(10_000).optional(),
});
const servicePatchSchema = serviceSchema.partial().extend({
  version: z.number().int().positive(),
});
const priceSchema = z.object({
  effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  priceMinor: z.number().int().nonnegative(),
  serviceId: z.string().min(8).max(64),
  vehicleTypeCode: vehicleTypeCodeSchema,
});

export const serviceRoutes = new Hono<AppBindings>();
export const servicePriceRoutes = new Hono<AppBindings>();

serviceRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const includeInactive =
    c.req.query("includeInactive") === "true" && auth.role === "ADMIN";
  const [services, prices, vehicleTypes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM services WHERE organization_id = ? ${includeInactive ? "" : "AND is_active = 1"} ORDER BY service_kind DESC, display_order, name`,
    )
      .bind(auth.organizationId)
      .all(),
    c.env.DB.prepare(
      `SELECT sp.*, vt.name AS vehicle_type_name FROM service_prices sp
       INNER JOIN vehicle_types vt ON vt.id = sp.vehicle_type_id
       WHERE sp.organization_id = ? AND sp.is_active = 1 AND sp.effective_to IS NULL`,
    )
      .bind(auth.organizationId)
      .all(),
    c.env.DB.prepare(
      "SELECT id, code, name FROM vehicle_types WHERE organization_id = ? AND is_active = 1 ORDER BY display_order, name",
    )
      .bind(auth.organizationId)
      .all(),
  ]);
  return c.json({
    data: {
      prices: prices.results,
      services: services.results,
      vehicleTypes: vehicleTypes.results,
    },
    success: true,
  });
});

serviceRoutes.post("/", requirePermission("services.manage"), async (c) => {
  const parsed = serviceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the service details.");
  const auth = c.get("auth");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO services (
          id, organization_id, code, name, description, category, service_kind,
          base_price_minor, estimated_duration_minutes, is_taxable,
          tax_rate_basis_points, display_order, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        auth.organizationId,
        normalizeCode(parsed.data.code),
        parsed.data.name,
        parsed.data.description ?? null,
        parsed.data.category ?? null,
        parsed.data.serviceKind,
        parsed.data.basePriceMinor,
        parsed.data.estimatedDurationMinutes ?? null,
        parsed.data.isTaxable ? 1 : 0,
        parsed.data.taxRateBasisPoints ?? null,
        parsed.data.displayOrder,
        auth.userId,
        auth.userId,
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "SERVICE_CREATED",
        auth,
        next: parsed.data,
        recordId: id,
        recordType: "SERVICE",
        requestId: c.get("requestId"),
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE"))
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "That service code is already in use.",
      );
    throw error;
  }
  return c.json(
    {
      data: await c.env.DB.prepare("SELECT * FROM services WHERE id = ?")
        .bind(id)
        .first(),
      success: true,
    },
    201,
  );
});

serviceRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const service = await c.env.DB.prepare(
    "SELECT * FROM services WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (service === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Service not found.");
  const prices = await c.env.DB.prepare(
    "SELECT * FROM service_prices WHERE service_id = ? AND organization_id = ? ORDER BY effective_from DESC",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .all();
  return c.json({
    data: { ...service, priceHistory: prices.results },
    success: true,
  });
});

serviceRoutes.patch("/:id", requirePermission("services.manage"), async (c) => {
  const parsed = servicePatchSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the service details.");
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT * FROM services WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Service not found.");
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE services SET
      code = COALESCE(?, code), name = COALESCE(?, name),
      description = CASE WHEN ? = 1 THEN ? ELSE description END,
      category = CASE WHEN ? = 1 THEN ? ELSE category END,
      service_kind = COALESCE(?, service_kind), base_price_minor = COALESCE(?, base_price_minor),
      estimated_duration_minutes = CASE WHEN ? = 1 THEN ? ELSE estimated_duration_minutes END,
      is_taxable = COALESCE(?, is_taxable),
      tax_rate_basis_points = CASE WHEN ? = 1 THEN ? ELSE tax_rate_basis_points END,
      display_order = COALESCE(?, display_order), updated_by_user_id = ?,
      updated_at = ?, version = version + 1
     WHERE id = ? AND organization_id = ? AND version = ?`,
  )
    .bind(
      parsed.data.code === undefined ? null : normalizeCode(parsed.data.code),
      parsed.data.name ?? null,
      parsed.data.description === undefined ? 0 : 1,
      parsed.data.description ?? null,
      parsed.data.category === undefined ? 0 : 1,
      parsed.data.category ?? null,
      parsed.data.serviceKind ?? null,
      parsed.data.basePriceMinor ?? null,
      parsed.data.estimatedDurationMinutes === undefined ? 0 : 1,
      parsed.data.estimatedDurationMinutes ?? null,
      parsed.data.isTaxable === undefined
        ? null
        : parsed.data.isTaxable
          ? 1
          : 0,
      parsed.data.taxRateBasisPoints === undefined ? 0 : 1,
      parsed.data.taxRateBasisPoints ?? null,
      parsed.data.displayOrder ?? null,
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
      "This service changed on another device.",
    );
  const updated = await c.env.DB.prepare("SELECT * FROM services WHERE id = ?")
    .bind(c.req.param("id"))
    .first();
  await auditStatement(c.env, {
    action: "SERVICE_UPDATED",
    auth,
    next: updated,
    previous,
    recordId: c.req.param("id"),
    recordType: "SERVICE",
    requestId: c.get("requestId"),
  }).run();
  return c.json({ data: updated, success: true });
});

for (const [path, active] of [
  ["enable", 1],
  ["disable", 0],
] as const) {
  serviceRoutes.post(
    `/:id/${path}`,
    requirePermission("services.manage"),
    async (c) => {
      const auth = c.get("auth");
      const result = await c.env.DB.prepare(
        "UPDATE services SET is_active = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
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
        throw new ApiError(404, "RESOURCE_NOT_FOUND", "Service not found.");
      await auditStatement(c.env, {
        action: active === 1 ? "SERVICE_ENABLED" : "SERVICE_DISABLED",
        auth,
        recordId: c.req.param("id"),
        recordType: "SERVICE",
        requestId: c.get("requestId"),
      }).run();
      return c.json({ data: { isActive: active === 1 }, success: true });
    },
  );
}

servicePriceRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    "SELECT * FROM service_prices WHERE organization_id = ? ORDER BY effective_from DESC",
  )
    .bind(auth.organizationId)
    .all();
  return c.json({ data: result.results, success: true });
});

servicePriceRoutes.post("/", requirePermission("pricing.manage"), async (c) => {
  const parsed = priceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the price details.");
  const auth = c.get("auth");
  const vt = await c.env.DB.prepare(
    "SELECT id FROM vehicle_types WHERE organization_id = ? AND code = ? AND is_active = 1",
  )
    .bind(auth.organizationId, parsed.data.vehicleTypeCode)
    .first<{ id: string }>();
  if (vt === null)
    throw new ApiError(422, "VALIDATION_ERROR", "Select a valid vehicle type.");
  const vehicleTypeId = vt.id;
  const effectiveFrom = parsed.data.effectiveFrom ?? new Date().toISOString();
  const id = crypto.randomUUID();
  const existing = await c.env.DB.prepare(
    "SELECT * FROM service_prices WHERE organization_id = ? AND service_id = ? AND vehicle_type_id = ? AND is_active = 1 AND effective_to IS NULL",
  )
    .bind(auth.organizationId, parsed.data.serviceId, vehicleTypeId)
    .first<Record<string, unknown>>();
  const statements: D1PreparedStatement[] = [];
  if (existing !== null) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE service_prices SET is_active = 0, effective_to = ? WHERE id = ? AND is_active = 1",
      ).bind(effectiveFrom, existing.id),
    );
  }
  statements.push(
    c.env.DB.prepare(
      "INSERT INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, effective_from, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      id,
      auth.organizationId,
      parsed.data.serviceId,
      vehicleTypeId,
      parsed.data.priceMinor,
      effectiveFrom,
      auth.userId,
      new Date().toISOString(),
    ),
    auditStatement(c.env, {
      action: "SERVICE_PRICE_CHANGED",
      auth,
      next: parsed.data,
      previous: existing,
      recordId: id,
      recordType: "SERVICE_PRICE",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }),
  );
  await c.env.DB.batch(statements);
  const created = await c.env.DB.prepare(
    "SELECT * FROM service_prices WHERE id = ?",
  )
    .bind(id)
    .first();
  if (created === null)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Select a valid service and vehicle type.",
    );
  return c.json({ data: created, success: true }, 201);
});

servicePriceRoutes.patch(
  "/:id",
  requirePermission("pricing.manage"),
  async (c) => {
    const parsed = z
      .object({
        effectiveFrom: z.iso.datetime({ offset: true }).optional(),
        priceMinor: z.number().int().nonnegative(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(422, "VALIDATION_ERROR", "Enter a valid price.");
    const auth = c.get("auth");
    const current = await c.env.DB.prepare(
      "SELECT * FROM service_prices WHERE id = ? AND organization_id = ? AND is_active = 1 AND effective_to IS NULL",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<
        Record<string, unknown> & {
          service_id: string;
          vehicle_type_id: string;
        }
      >();
    if (current === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Active price not found.");
    const effectiveFrom = parsed.data.effectiveFrom ?? new Date().toISOString();
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE service_prices SET is_active = 0, effective_to = ? WHERE id = ? AND is_active = 1 AND effective_to IS NULL",
      ).bind(effectiveFrom, c.req.param("id")),
      c.env.DB.prepare(
        "INSERT INTO service_prices (id, organization_id, service_id, vehicle_type_id, price_minor, effective_from, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        id,
        auth.organizationId,
        current.service_id,
        current.vehicle_type_id,
        parsed.data.priceMinor,
        effectiveFrom,
        auth.userId,
        new Date().toISOString(),
      ),
      auditStatement(c.env, {
        action: "SERVICE_PRICE_CHANGED",
        auth,
        next: parsed.data,
        previous: current,
        recordId: id,
        recordType: "SERVICE_PRICE",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }),
    ]);
    return c.json(
      {
        data: await c.env.DB.prepare(
          "SELECT * FROM service_prices WHERE id = ?",
        )
          .bind(id)
          .first(),
        success: true,
      },
      201,
    );
  },
);
