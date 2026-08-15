import { vehicleInputSchema, vehicleTypeCodeSchema } from "@washpro/contracts";
import { normalizeRegistration, normalizeVehicleMake, normalizeVehicleModel } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import {
  buildListCursor,
  parseListCursor,
  parseListLimit,
} from "../services/pagination";
import {
  maskCustomerPhoneRow,
  maskPhoneSnapshotRow,
} from "../services/phone-masking";
import type { AppBindings } from "../types";

const vehicleTypeCodeOptional = z.object({
  vehicleTypeCode: vehicleTypeCodeSchema.optional(),
});

const vehiclePatchSchema = vehicleInputSchema.partial().extend({
  colour: z.string().trim().max(40).nullable().optional(),
  fuelType: z.string().trim().max(40).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  manufacturingYear: z.number().int().min(1900).max(2200).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
  version: z.number().int().positive(),
}).and(vehicleTypeCodeOptional);
const statusSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().positive(),
});

function duplicate(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}

export const vehicleRoutes = new Hono<AppBindings>();

vehicleRoutes.get("/", requirePermission("vehicles.read"), async (c) => {
  const auth = c.get("auth");
  const query = c.req.query("search")?.trim() ?? "";
  const search = `%${query.toUpperCase().replace(/[^A-Z0-9]/gu, "")}%`;
  const columns = `v.*, vt.code AS vehicle_type_code, vt.name AS vehicle_type_name,
    c.full_name AS customer_name, c.phone AS customer_phone`;
  const filters = `v.organization_id = ? AND (? = '' OR v.registration_normalized LIKE ?)`;
  const baseParams = [auth.organizationId, query, search] as const;
  if (
    c.req.query("limit") === undefined &&
    c.req.query("cursor") === undefined
  ) {
    const result = await c.env.DB.prepare(
      `SELECT ${columns}
       FROM vehicles v
       INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
       INNER JOIN customers c ON c.id = v.customer_id
       WHERE ${filters}
       ORDER BY COALESCE(v.last_wash_at, v.created_at) DESC LIMIT 100`,
    )
      .bind(...baseParams)
      .all();
    return c.json({
      data: result.results.map((vehicle) =>
        maskCustomerPhoneRow(vehicle, auth.role),
      ),
      success: true,
    });
  }
  const limit = parseListLimit(c.req.query("limit"));
  const rawCursor = c.req.query("cursor");
  const cursor =
    rawCursor === undefined || rawCursor === ""
      ? undefined
      : parseListCursor(rawCursor);
  const result =
    cursor === undefined
      ? await c.env.DB.prepare(
          `SELECT ${columns}
           FROM vehicles v
           INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
           INNER JOIN customers c ON c.id = v.customer_id
           WHERE ${filters}
           ORDER BY COALESCE(v.last_wash_at, v.created_at) DESC, v.id DESC
           LIMIT ?`,
        )
          .bind(...baseParams, limit + 1)
          .all()
      : await c.env.DB.prepare(
          `SELECT ${columns}
           FROM vehicles v
           INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
           INNER JOIN customers c ON c.id = v.customer_id
           WHERE ${filters}
             AND (
               COALESCE(v.last_wash_at, v.created_at) < ?
               OR (COALESCE(v.last_wash_at, v.created_at) = ? AND v.id < ?)
             )
           ORDER BY COALESCE(v.last_wash_at, v.created_at) DESC, v.id DESC
           LIMIT ?`,
        )
          .bind(
            ...baseParams,
            cursor.orderValue,
            cursor.orderValue,
            cursor.id,
            limit + 1,
          )
          .all();
  const rows = result.results;
  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasNext && lastRow !== undefined
      ? buildListCursor(
          (lastRow.last_wash_at as string | null) ??
            (lastRow.created_at as string),
          lastRow.id as string,
        )
      : null;
  return c.json({
    data: {
      vehicles: pageRows.map((vehicle) =>
        maskCustomerPhoneRow(vehicle, auth.role),
      ),
      pagination: { hasNext, limit, nextCursor },
    },
    success: true,
  });
});

vehicleRoutes.post("/", requirePermission("vehicles.create"), async (c) => {
  const parsed = vehicleInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the vehicle details.");
  const auth = c.get("auth");
  const vt = await c.env.DB.prepare(
    "SELECT id FROM vehicle_types WHERE organization_id = ? AND code = ? AND is_active = 1",
  )
    .bind(auth.organizationId, parsed.data.vehicleTypeCode)
    .first<{ id: string }>();
  if (vt === null) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Select an active vehicle type.",
    );
  }
  const vehicleTypeId = vt.id;
  const customer = await c.env.DB.prepare(
    "SELECT id FROM customers WHERE id = ? AND organization_id = ? AND status = 'ACTIVE'",
  )
    .bind(parsed.data.customerId, auth.organizationId)
    .first<{ id: string }>();
  if (customer === null) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Select an active customer.",
    );
  }
  let registration: ReturnType<typeof normalizeRegistration>;
  try {
    registration = normalizeRegistration(parsed.data.registrationNumber);
  } catch {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Enter a valid registration number.",
    );
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = {
    customerId: parsed.data.customerId,
    id,
    registrationNumber: registration.display,
    registrationNormalized: registration.search,
    vehicleTypeCode: parsed.data.vehicleTypeCode,
    vehicleTypeId,
  };
  const modelNormalized:
    | { readonly name: string; readonly normalizedName: string }
    | null =
    parsed.data.model !== undefined && parsed.data.model !== null
      ? normalizeVehicleModel(parsed.data.model)
      : null;
  const makeNormalized:
    | { readonly name: string; readonly normalizedName: string }
    | null =
    parsed.data.make !== undefined && parsed.data.make !== null
      ? normalizeVehicleMake(parsed.data.make)
      : null;
  try {
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO vehicles (
          id, organization_id, customer_id, vehicle_type_id, registration_number,
          registration_normalized, make, model, manufacturing_year, colour,
          fuel_type, notes, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        auth.organizationId,
        parsed.data.customerId,
        vehicleTypeId,
        registration.display,
        registration.search,
        makeNormalized === null ? null : makeNormalized.name,
        modelNormalized === null ? null : modelNormalized.name,
        parsed.data.manufacturingYear ?? null,
        parsed.data.colour ?? null,
        parsed.data.fuelType ?? null,
        parsed.data.notes ?? null,
        auth.userId,
        auth.userId,
        now,
        now,
      ),
      auditStatement(c.env, {
        action: "VEHICLE_CREATED",
        auth,
        next: record,
        recordId: id,
        recordType: "VEHICLE",
        requestId: c.get("requestId"),
      }),
    ];
    if (modelNormalized !== null) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO vehicle_models (id, organization_id, name, normalized_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (organization_id, normalized_name)
           DO UPDATE SET updated_at = excluded.updated_at`,
        ).bind(
          crypto.randomUUID(),
          auth.organizationId,
          modelNormalized.name,
          modelNormalized.normalizedName,
          now,
          now,
        ),
      );
    }
    if (makeNormalized !== null) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO vehicle_makes (id, organization_id, name, normalized_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (organization_id, normalized_name)
           DO UPDATE SET updated_at = excluded.updated_at`,
        ).bind(
          crypto.randomUUID(),
          auth.organizationId,
          makeNormalized.name,
          makeNormalized.normalizedName,
          now,
          now,
        ),
      );
    }
    await c.env.DB.batch(statements);
  } catch (error) {
    if (duplicate(error)) {
      throw new ApiError(
        409,
        "DUPLICATE_VEHICLE",
        "A vehicle with this registration already exists.",
      );
    }
    throw error;
  }
  const created = await c.env.DB.prepare(
    `SELECT v.*, vt.code AS vehicle_type_code, vt.name AS vehicle_type_name
     FROM vehicles v INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
     WHERE v.id = ? AND v.organization_id = ?`,
  )
    .bind(id, auth.organizationId)
    .first();
  return c.json({ data: created, success: true }, 201);
});

vehicleRoutes.get("/:id", requirePermission("vehicles.read"), async (c) => {
  const auth = c.get("auth");
  const vehicle = await c.env.DB.prepare(
    `SELECT v.*, vt.code AS vehicle_type_code, vt.name AS vehicle_type_name, c.full_name AS customer_name,
      c.phone AS customer_phone
     FROM vehicles v INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
     INNER JOIN customers c ON c.id = v.customer_id
     WHERE v.id = ? AND v.organization_id = ?`,
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (vehicle === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Vehicle not found.");
  return c.json({
    data: maskCustomerPhoneRow(vehicle, auth.role),
    success: true,
  });
});

vehicleRoutes.patch("/:id", requirePermission("vehicles.update"), async (c) => {
  const parsed = vehiclePatchSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Check the vehicle details.");
  const auth = c.get("auth");
  const previous = await c.env.DB.prepare(
    "SELECT * FROM vehicles WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first<Record<string, unknown>>();
  if (previous === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Vehicle not found.");
  let vehicleTypeId: string | null = null;
  if (parsed.data.vehicleTypeCode !== undefined) {
    const vt = await c.env.DB.prepare(
      "SELECT id FROM vehicle_types WHERE organization_id = ? AND code = ? AND is_active = 1",
    )
      .bind(auth.organizationId, parsed.data.vehicleTypeCode)
      .first<{ id: string }>();
    if (vt === null)
      throw new ApiError(422, "VALIDATION_ERROR", "Select an active vehicle type.");
    vehicleTypeId = vt.id;
  }
  const registration =
    parsed.data.registrationNumber === undefined
      ? undefined
      : normalizeRegistration(parsed.data.registrationNumber);
  const modelNormalized:
    | { readonly name: string; readonly normalizedName: string }
    | null =
    parsed.data.model !== undefined && parsed.data.model !== null
      ? normalizeVehicleModel(parsed.data.model)
      : null;
  const makeNormalized:
    | { readonly name: string; readonly normalizedName: string }
    | null =
    parsed.data.make !== undefined && parsed.data.make !== null
      ? normalizeVehicleMake(parsed.data.make)
      : null;
  const now = new Date().toISOString();
  try {
    const result = await c.env.DB.prepare(
      `UPDATE vehicles SET
        customer_id = COALESCE(?, customer_id), vehicle_type_id = COALESCE(?, vehicle_type_id),
        registration_number = COALESCE(?, registration_number),
        registration_normalized = COALESCE(?, registration_normalized),
        make = CASE WHEN ? = 1 THEN ? ELSE make END,
        model = CASE WHEN ? = 1 THEN ? ELSE model END,
        manufacturing_year = CASE WHEN ? = 1 THEN ? ELSE manufacturing_year END,
        colour = CASE WHEN ? = 1 THEN ? ELSE colour END,
        fuel_type = CASE WHEN ? = 1 THEN ? ELSE fuel_type END,
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        updated_by_user_id = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND organization_id = ? AND version = ?`,
    )
      .bind(
        parsed.data.customerId ?? null,
        vehicleTypeId,
        registration?.display ?? null,
        registration?.search ?? null,
        parsed.data.make === undefined ? 0 : 1,
        makeNormalized === null ? null : makeNormalized.name,
        parsed.data.model === undefined ? 0 : 1,
        modelNormalized === null ? null : modelNormalized.name,
        parsed.data.manufacturingYear === undefined ? 0 : 1,
        parsed.data.manufacturingYear ?? null,
        parsed.data.colour === undefined ? 0 : 1,
        parsed.data.colour ?? null,
        parsed.data.fuelType === undefined ? 0 : 1,
        parsed.data.fuelType ?? null,
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
        "This vehicle changed on another device.",
      );
    }
    if (modelNormalized !== null) {
      await c.env.DB.prepare(
        `INSERT INTO vehicle_models (id, organization_id, name, normalized_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (organization_id, normalized_name)
         DO UPDATE SET updated_at = excluded.updated_at`,
      )
        .bind(
          crypto.randomUUID(),
          auth.organizationId,
          modelNormalized.name,
          modelNormalized.normalizedName,
          now,
          now,
        )
        .run();
    }
    if (makeNormalized !== null) {
      await c.env.DB.prepare(
        `INSERT INTO vehicle_makes (id, organization_id, name, normalized_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (organization_id, normalized_name)
         DO UPDATE SET updated_at = excluded.updated_at`,
      )
        .bind(
          crypto.randomUUID(),
          auth.organizationId,
          makeNormalized.name,
          makeNormalized.normalizedName,
          now,
          now,
        )
        .run();
    }
  } catch (error) {
    if (duplicate(error))
      throw new ApiError(
        409,
        "DUPLICATE_VEHICLE",
        "That registration is already in use.",
      );
    throw error;
  }
  const updated = await c.env.DB.prepare(
    "SELECT v.*, vt.code AS vehicle_type_code, vt.name AS vehicle_type_name FROM vehicles v INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id WHERE v.id = ?",
  )
    .bind(c.req.param("id"))
    .first();
  await auditStatement(c.env, {
    action:
      previous.customer_id === parsed.data.customerId
        ? "VEHICLE_UPDATED"
        : "VEHICLE_OWNERSHIP_CHANGED",
    auth,
    next: updated,
    previous,
    recordId: c.req.param("id"),
    recordType: "VEHICLE",
    requestId: c.get("requestId"),
  }).run();
  return c.json({ data: updated, success: true });
});

for (const [path, status, action] of [
  ["deactivate", "INACTIVE", "VEHICLE_DEACTIVATED"],
  ["reactivate", "ACTIVE", "VEHICLE_REACTIVATED"],
] as const) {
  vehicleRoutes.post(
    `/:id/${path}`,
    requirePermission("vehicles.deactivate"),
    async (c) => {
      const parsed = statusSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "A reason and current version are required.",
        );
      const auth = c.get("auth");
      const now = new Date().toISOString();
      const result = await c.env.DB.prepare(
        `UPDATE vehicles SET status = ?, deactivated_at = ?, deactivated_by_user_id = ?,
        deactivation_reason = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND organization_id = ? AND version = ?`,
      )
        .bind(
          status,
          status === "INACTIVE" ? now : null,
          status === "INACTIVE" ? auth.userId : null,
          status === "INACTIVE" ? parsed.data.reason : null,
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
          "The vehicle could not be updated.",
        );
      await auditStatement(c.env, {
        action,
        auth,
        reason: parsed.data.reason,
        recordId: c.req.param("id"),
        recordType: "VEHICLE",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }).run();
      return c.json({ data: { status }, success: true });
    },
  );
}

vehicleRoutes.get(
  "/:id/history",
  requirePermission("vehicles.read"),
  async (c) => {
    const auth = c.get("auth");
    const vehicleId = c.req.param("id");
    const [washJobs, invoices, photos, locations] = await Promise.all([
      c.env.DB.prepare(
        "SELECT * FROM wash_jobs WHERE vehicle_id = ? AND organization_id = ? ORDER BY created_at DESC",
      )
        .bind(vehicleId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT i.* FROM invoices i INNER JOIN wash_jobs w ON w.id = i.wash_job_id WHERE w.vehicle_id = ? AND i.organization_id = ? ORDER BY i.created_at DESC",
      )
        .bind(vehicleId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT * FROM vehicle_photos WHERE vehicle_id = ? AND organization_id = ? ORDER BY created_at DESC",
      )
        .bind(vehicleId, auth.organizationId)
        .all(),
      c.env.DB.prepare(
        "SELECT lc.* FROM location_captures lc INNER JOIN wash_jobs w ON w.id = lc.wash_job_id WHERE w.vehicle_id = ? AND lc.organization_id = ? ORDER BY lc.captured_at DESC",
      )
        .bind(vehicleId, auth.organizationId)
        .all(),
    ]);
    return c.json({
      data: {
        invoices: invoices.results.map((invoice) =>
          maskPhoneSnapshotRow(invoice, auth.role),
        ),
        locations: locations.results,
        photos: photos.results,
        washJobs: washJobs.results.map((job) =>
          maskPhoneSnapshotRow(job, auth.role),
        ),
      },
      success: true,
    });
  },
);
