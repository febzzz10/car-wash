import type {
  DiscountType,
  WashJobStatus,
} from "@washpro/contracts";
import {
  calculateBill,
  calculateTimer,
  getNextStatus,
  normalizeCode,
  validateCoupon,
  validateReferral,
} from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { sha256 } from "../security/tokens";
import { auditStatement } from "../services/audit";
import {
  booleanSetting,
  integerSetting,
  loadSettings,
  stringSetting,
} from "../services/settings";
import type { AppBindings } from "../types";

const COORDINATE_ONLY = /^\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,2}(?:\.\d+)?\s*[°d]?\s*[NS]?\s*[,;\s]+\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,3}(?:\.\d+)?\s*[°d]?\s*[EW]?\s*$/i;

const idSchema = z.string().trim().min(8).max(64);
const createJobSchema = z.object({
  addOnServiceIds: z.array(idSchema).max(20).default([]),
  assignedUserId: idSchema,
  couponCode: z.string().trim().max(40).optional(),
  customerId: idSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
  initialStatus: z.enum(["DRAFT", "WAITING", "IN_PROGRESS"]).default("WAITING"),
  location: z.object({
    place: z.string().trim().min(1).max(500)
      .refine(
        (val) => !COORDINATE_ONLY.test(val),
        { message: "Location place must be a human-readable place name, not raw coordinates." },
      )
      .optional(),
    capturedAt: z.iso.datetime({ offset: true }).optional(),
  }).strict().refine(
    (data) =>
      (data.place !== undefined && data.capturedAt !== undefined) ||
      (data.place === undefined && data.capturedAt === undefined),
    { message: "Both place and capturedAt must be provided together, or both omitted." },
  ),
  manualDiscountMinor: z.number().int().nonnegative().default(0),
  manualDiscountReason: z.string().trim().min(5).max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  photoAssetId: idSchema,
  primaryServiceId: idSchema,
  referralCode: z.string().trim().max(40).optional(),
  rewardAmountMinor: z.number().int().positive().optional(),
  rewardId: idSchema.optional(),
  vehicleId: idSchema,
}).strict();
const actionSchema = z.object({ version: z.number().int().positive() });
const cancelSchema = actionSchema.extend({
  reason: z.string().trim().min(5).max(500),
});
const timerAdjustmentSchema = z.object({
  adjustmentType: z.enum([
    "START_TIME_CORRECTION",
    "END_TIME_CORRECTION",
    "ACTIVE_DURATION_CORRECTION",
    "PAUSE_DURATION_CORRECTION",
  ]),
  newValue: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(5).max(500),
  version: z.number().int().positive(),
});
const assignmentSchema = z.object({
  assignedUserId: idSchema,
  reason: z.string().trim().min(5).max(500).optional(),
  version: z.number().int().positive(),
});

interface RelatedRow {
  readonly assigned_status: string;
  readonly branch_accuracy: number;
  readonly branch_latitude: number | null;
  readonly branch_longitude: number | null;
  readonly branch_radius: number;
  readonly customer_name: string;
  readonly customer_phone: string;
  readonly customer_status: string;
  readonly customer_visits: number;
  readonly vehicle_make: string | null;
  readonly vehicle_model: string | null;
  readonly vehicle_registration: string;
  readonly vehicle_status: string;
  readonly vehicle_type_id: string;
  readonly vehicle_type_name: string;
}

interface ServiceRow {
  readonly code: string;
  readonly description: string | null;
  readonly estimated_duration_minutes: number | null;
  readonly id: string;
  readonly is_taxable: number;
  readonly name: string;
  readonly price_minor: number;
  readonly service_kind: "PRIMARY" | "ADD_ON";
}

interface CouponRow {
  readonly code: string;
  readonly code_normalized: string;
  readonly discount_type: DiscountType;
  readonly discount_value: number;
  readonly expires_at: string;
  readonly id: string;
  readonly is_active: number;
  readonly maximum_discount_minor: number | null;
  readonly minimum_bill_minor: number;
  readonly new_customers_only: number;
  readonly start_at: string;
  readonly total_usage_count_cached: number;
  readonly total_usage_limit: number | null;
  readonly usage_limit_per_customer: number | null;
}

interface JobRow {
  readonly id: string;
  readonly organization_id: string;
  readonly status: WashJobStatus;
  readonly version: number;
}

function parseStringArray(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function allocate(total: number, amounts: readonly number[]): number[] {
  const base = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total === 0 || base === 0) return amounts.map(() => 0);
  const result = amounts.map((amount) => Math.floor((total * amount) / base));
  const allocated = result.reduce((sum, amount) => sum + amount, 0);
  const lastIndex = result.length - 1;
  if (lastIndex >= 0)
    result[lastIndex] = (result[lastIndex] ?? 0) + total - allocated;
  return result;
}

export const washJobRoutes = new Hono<AppBindings>();

washJobRoutes.get("/", requirePermission("wash_jobs.read"), async (c) => {
  const auth = c.get("auth");
  const status = c.req.query("status");
  const result = await c.env.DB.prepare(
    `SELECT * FROM wash_jobs
     WHERE organization_id = ? AND branch_id = ? AND (? IS NULL OR status = ?)
     ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PAUSED' THEN 1 WHEN 'WAITING' THEN 2 ELSE 3 END, created_at DESC
     LIMIT 200`,
  )
    .bind(auth.organizationId, auth.branchId, status ?? null, status ?? null)
    .all();
  return c.json({ data: result.results, success: true });
});

washJobRoutes.post("/", requirePermission("wash_jobs.create"), async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const idempotencyKey =
    raw !== null && typeof raw === "object" && "idempotencyKey" in raw
      ? String((raw as { idempotencyKey: unknown }).idempotencyKey)
      : "";
  const auth = c.get("auth");
  if (idempotencyKey.length >= 16) {
    const existing = await c.env.DB.prepare(
      "SELECT resource_id FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'WASH_JOB_CREATE' AND idempotency_key = ? AND state = 'COMPLETED'",
    )
      .bind(auth.organizationId, idempotencyKey)
      .first<string>("resource_id");
    if (existing !== null) {
      const job = await c.env.DB.prepare(
        "SELECT * FROM wash_jobs WHERE id = ? AND organization_id = ?",
      )
        .bind(existing, auth.organizationId)
        .first();
      if (job !== null)
        return c.json({ data: job, idempotentReplay: true, success: true });
    }
  }

  const parsed = createJobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Check each wash step and try again.",
    );
  }
  if (
    parsed.data.manualDiscountMinor > 0 &&
    (parsed.data.manualDiscountReason === undefined ||
      (auth.role !== "ADMIN" && !auth.permissions.includes("payments.adjust")))
  ) {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "Manual discounts require permission and a reason.",
    );
  }
  if (auth.branchId === null) {
    throw new ApiError(
      422,
      "LOCATION_CAPTURE_REQUIRED",
      "Select a business branch before creating a wash.",
    );
  }

  const related = await c.env.DB.prepare(
    `SELECT c.full_name AS customer_name, c.phone AS customer_phone,
      c.status AS customer_status, c.total_visits_cached AS customer_visits,
      v.registration_number AS vehicle_registration, v.make AS vehicle_make,
      v.model AS vehicle_model, v.status AS vehicle_status, v.vehicle_type_id,
      vt.name AS vehicle_type_name, u.status AS assigned_status,
      b.latitude AS branch_latitude, b.longitude AS branch_longitude,
      b.allowed_radius_meters AS branch_radius,
      b.minimum_gps_accuracy_meters AS branch_accuracy
     FROM customers c
     INNER JOIN vehicles v ON v.customer_id = c.id AND v.organization_id = c.organization_id
     INNER JOIN vehicle_types vt ON vt.id = v.vehicle_type_id AND vt.organization_id = c.organization_id
     INNER JOIN users u ON u.organization_id = c.organization_id
     INNER JOIN branches b ON b.id = ? AND b.organization_id = c.organization_id
     WHERE c.id = ? AND v.id = ? AND u.id = ? AND c.organization_id = ?`,
  )
    .bind(
      auth.branchId,
      parsed.data.customerId,
      parsed.data.vehicleId,
      parsed.data.assignedUserId,
      auth.organizationId,
    )
    .first<RelatedRow>();
  if (
    related === null ||
    related.customer_status !== "ACTIVE" ||
    related.vehicle_status !== "ACTIVE" ||
    related.assigned_status !== "ACTIVE"
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Select active customer, vehicle, and Staff records.",
    );
  }

  const services = await c.env.DB.prepare(
    `SELECT s.id, s.code, s.name, s.description, s.service_kind,
      s.estimated_duration_minutes, s.is_taxable,
      sp.price_minor
     FROM services s
     INNER JOIN service_prices sp ON sp.service_id = s.id
       AND sp.vehicle_type_id = ? AND sp.is_active = 1 AND sp.effective_to IS NULL
     WHERE s.organization_id = ? AND s.is_active = 1
       AND (s.id = ? OR s.id IN (SELECT value FROM json_each(?)))`,
  )
    .bind(
      related.vehicle_type_id,
      auth.organizationId,
      parsed.data.primaryServiceId,
      JSON.stringify(parsed.data.addOnServiceIds),
    )
    .all<ServiceRow>();
  const primary = services.results.find(
    (service) =>
      service.id === parsed.data.primaryServiceId &&
      service.service_kind === "PRIMARY",
  );
  const addOns = parsed.data.addOnServiceIds.map((id) =>
    services.results.find(
      (service) => service.id === id && service.service_kind === "ADD_ON",
    ),
  );
  if (
    primary === undefined ||
    addOns.some((service) => service === undefined)
  ) {
    throw new ApiError(
      422,
      "PRICE_NOT_CONFIGURED",
      "Price is not configured for this vehicle type.",
    );
  }
  const selectedServices = [
    primary,
    ...addOns.filter((service): service is ServiceRow => service !== undefined),
  ];

  const asset = await c.env.DB.prepare(
    `SELECT fa.id, fa.metadata_json
     FROM file_assets fa
     LEFT JOIN vehicle_photos vp ON vp.file_asset_id = fa.id
     WHERE fa.id = ? AND fa.organization_id = ? AND fa.branch_id = ?
       AND fa.asset_type = 'VEHICLE_LIVE_PHOTO' AND fa.access_level = 'PRIVATE'
       AND fa.upload_status = 'READY' AND vp.id IS NULL`,
  )
    .bind(parsed.data.photoAssetId, auth.organizationId, auth.branchId)
    .first<{ id: string; metadata_json: string | null }>();
  let photoMetadata: Record<string, unknown> = {};
  try {
    photoMetadata = JSON.parse(asset?.metadata_json ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    // Invalid metadata is rejected below.
  }
  if (asset === null || photoMetadata["captureSource"] !== "CAMERA") {
    throw new ApiError(
      422,
      "CAMERA_CAPTURE_REQUIRED",
      "Capture a new live vehicle photo.",
    );
  }

  const settings = await loadSettings(
    c.env,
    auth.organizationId,
    auth.branchId,
  );
  const subtotalMinor = selectedServices.reduce(
    (sum, service) => sum + service.price_minor,
    0,
  );
  const serviceIds = selectedServices.map((service) => service.id);
  let coupon: CouponRow | null = null;
  let couponDiscountMinor = 0;
  if (
    parsed.data.couponCode !== undefined &&
    parsed.data.couponCode.trim() !== ""
  ) {
    coupon = await c.env.DB.prepare(
      "SELECT * FROM coupons WHERE organization_id = ? AND code_normalized = ?",
    )
      .bind(auth.organizationId, normalizeCode(parsed.data.couponCode))
      .first<CouponRow>();
    if (coupon === null)
      throw new ApiError(422, "COUPON_INVALID", "The coupon code is invalid.");
    const [eligibleServices, eligibleVehicleTypes, usage] = await Promise.all([
      c.env.DB.prepare(
        "SELECT service_id FROM coupon_eligible_services WHERE coupon_id = ?",
      )
        .bind(coupon.id)
        .all<{ service_id: string }>(),
      c.env.DB.prepare(
        "SELECT vehicle_type_id FROM coupon_eligible_vehicle_types WHERE coupon_id = ?",
      )
        .bind(coupon.id)
        .all<{ vehicle_type_id: string }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ? AND status IN ('RESERVED', 'REDEEMED')",
      )
        .bind(coupon.id, parsed.data.customerId)
        .first<number>("count"),
    ]);
    const validation = validateCoupon(
      {
        active: coupon.is_active === 1,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        eligibleServiceIds: eligibleServices.results.map(
          (row) => row.service_id,
        ),
        eligibleVehicleTypeIds: eligibleVehicleTypes.results.map(
          (row) => row.vehicle_type_id,
        ),
        expiresAt: coupon.expires_at,
        maximumDiscountMinor: coupon.maximum_discount_minor,
        minimumBillMinor: coupon.minimum_bill_minor,
        newCustomersOnly: coupon.new_customers_only === 1,
        perCustomerLimit: coupon.usage_limit_per_customer,
        startsAt: coupon.start_at,
        totalUsageLimit: coupon.total_usage_limit,
      },
      {
        customerCompletedVisits: related.customer_visits,
        customerUsageCount: usage ?? 0,
        now: new Date().toISOString(),
        serviceIds,
        subtotalMinor,
        totalUsageCount: coupon.total_usage_count_cached,
        vehicleTypeId: related.vehicle_type_id,
      },
    );
    if (!validation.valid)
      throw new ApiError(
        422,
        validation.reason,
        "The coupon is not eligible for this wash.",
      );
    couponDiscountMinor = validation.discountMinor;
  }

  let referral: {
    readonly code: string;
    readonly codeId: string;
    readonly discountMinor: number;
    readonly referrerCustomerId: string;
    readonly rewardType: DiscountType;
    readonly rewardValue: number;
  } | null = null;
  if (
    parsed.data.referralCode !== undefined &&
    parsed.data.referralCode.trim() !== ""
  ) {
    if (
      coupon !== null &&
      !booleanSetting(settings, "coupon.allow_referral_stacking", false)
    ) {
      throw new ApiError(
        422,
        "REFERRAL_INVALID",
        "Coupon and referral stacking is disabled.",
      );
    }
    const code = await c.env.DB.prepare(
      "SELECT * FROM referral_codes WHERE organization_id = ? AND code_normalized = ?",
    )
      .bind(auth.organizationId, normalizeCode(parsed.data.referralCode))
      .first<{
        code: string;
        customer_id: string;
        expires_at: string | null;
        id: string;
        status: "ACTIVE" | "DISABLED" | "EXPIRED";
      }>();
    if (code === null)
      throw new ApiError(
        422,
        "REFERRAL_INVALID",
        "The referral code is invalid.",
      );
    const alreadyUsed =
      (await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM referral_redemptions WHERE referred_customer_id = ? AND status IN ('PENDING', 'QUALIFIED', 'REWARD_ISSUED')",
      )
        .bind(parsed.data.customerId)
        .first<number>("count")) ?? 0;
    const friendType = stringSetting(
      settings,
      "referral.friend_discount_type",
      "FIXED",
    ) as DiscountType;
    const validation = validateReferral(
      {
        eligibleServiceIds: parseStringArray(
          stringSetting(settings, "referral.eligible_service_ids", "[]"),
        ),
        eligibleVehicleTypeIds: parseStringArray(
          stringSetting(settings, "referral.eligible_vehicle_type_ids", "[]"),
        ),
        enabled: booleanSetting(settings, "referral.enabled", true),
        expiresAt: code.expires_at,
        friendDiscountType: friendType,
        friendDiscountValue: integerSetting(
          settings,
          "referral.friend_discount_value",
          0,
        ),
        maximumDiscountMinor:
          integerSetting(settings, "referral.maximum_discount_minor", 0) ||
          null,
        minimumBillMinor: integerSetting(
          settings,
          "referral.minimum_bill_minor",
          0,
        ),
        newCustomersOnly: booleanSetting(
          settings,
          "referral.new_customers_only",
          true,
        ),
        referrerCustomerId: code.customer_id,
        status: code.status,
      },
      {
        benefitAlreadyUsed: alreadyUsed > 0,
        completedVisits: related.customer_visits,
        now: new Date().toISOString(),
        referredCustomerId: parsed.data.customerId,
        serviceIds,
        subtotalMinor,
        vehicleTypeId: related.vehicle_type_id,
      },
    );
    if (!validation.valid)
      throw new ApiError(
        422,
        validation.reason,
        "The referral is not eligible for this wash.",
      );
    referral = {
      code: code.code,
      codeId: code.id,
      discountMinor: validation.discountMinor,
      referrerCustomerId: code.customer_id,
      rewardType: stringSetting(
        settings,
        "referral.reward_type",
        "FIXED",
      ) as DiscountType,
      rewardValue: integerSetting(settings, "referral.reward_value", 0),
    };
  }

  let reward: { id: string; amountMinor: number; version: number } | null =
    null;
  if (parsed.data.rewardId !== undefined) {
    const row = await c.env.DB.prepare(
      "SELECT id, remaining_amount_minor, version FROM referral_rewards WHERE id = ? AND organization_id = ? AND customer_id = ? AND status = 'AVAILABLE' AND (expires_at IS NULL OR expires_at >= ?)",
    )
      .bind(
        parsed.data.rewardId,
        auth.organizationId,
        parsed.data.customerId,
        new Date().toISOString(),
      )
      .first<{ id: string; remaining_amount_minor: number; version: number }>();
    if (row === null)
      throw new ApiError(
        422,
        "REFERRAL_REWARD_UNAVAILABLE",
        "The selected reward is unavailable.",
      );
    reward = {
      id: row.id,
      amountMinor: Math.min(
        parsed.data.rewardAmountMinor ?? row.remaining_amount_minor,
        row.remaining_amount_minor,
      ),
      version: row.version,
    };
  }

  const taxRate = booleanSetting(settings, "tax.enabled", true)
    ? integerSetting(settings, "tax.rate_basis_points", 0)
    : 0;
  const rounding =
    stringSetting(settings, "billing.rounding_mode", "NONE") === "NEAREST_RUPEE"
      ? "NEAREST_RUPEE"
      : "NONE";
  const bill = calculateBill({
    couponDiscountMinor,
    items: selectedServices.map((service) => ({
      quantity: 1,
      unitPriceMinor: service.price_minor,
    })),
    manualDiscountMinor: parsed.data.manualDiscountMinor,
    referralDiscountMinor: referral?.discountMinor ?? 0,
    rewardDiscountMinor: reward?.amountMinor ?? 0,
    roundingMode: rounding,
    taxRateBasisPoints: taxRate,
  });

  const now = new Date();
  const year = now.getUTCFullYear();
  const sequence = await c.env.DB.prepare(
    "SELECT current_value FROM number_sequences WHERE organization_id = ? AND branch_id = ? AND sequence_type = 'WASH_JOB' AND sequence_year = ?",
  )
    .bind(auth.organizationId, auth.branchId, year)
    .first<number>("current_value");
  const nextSequence = (sequence ?? 0) + 1;
  const jobReference = `WJ-${year}-${String(nextSequence).padStart(6, "0")}`;
  const jobId = crypto.randomUUID();
  const photoId = crypto.randomUUID();

  const status = parsed.data.initialStatus;
  const requestHash = await sha256(JSON.stringify(parsed.data));
  const discounts = allocate(
    bill.totalDiscountMinor,
    selectedServices.map((service) => service.price_minor),
  );
  const taxableLines = selectedServices.map(
    (service, index) => service.price_minor - (discounts[index] ?? 0),
  );
  const taxes = allocate(bill.taxMinor, taxableLines);
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO number_sequences (organization_id, branch_id, sequence_type, sequence_year, current_value, updated_at) VALUES (?, ?, 'WASH_JOB', ?, ?, ?) ON CONFLICT (organization_id, branch_id, sequence_type, sequence_year) DO UPDATE SET current_value = excluded.current_value, updated_at = excluded.updated_at WHERE number_sequences.current_value = ?`,
    ).bind(
      auth.organizationId,
      auth.branchId,
      year,
      nextSequence,
      now.toISOString(),
      nextSequence - 1,
    ),
    c.env.DB.prepare(
      `INSERT INTO wash_jobs (id, organization_id, branch_id, job_reference, customer_id, vehicle_id, assigned_user_id, customer_name_snapshot, customer_phone_snapshot, vehicle_registration_snapshot, vehicle_type_name_snapshot, vehicle_make_snapshot, vehicle_model_snapshot, status, subtotal_minor, coupon_discount_minor, referral_discount_minor, reward_discount_minor, manual_discount_minor, total_discount_minor, taxable_amount_minor, tax_minor, rounding_minor, total_amount_minor, balance_minor, tax_rate_basis_points, started_at, mandatory_photo_verified, mandatory_location_verified, location_place, location_captured_at, notes, manual_discount_reason, created_by_user_id, updated_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      jobId,
      auth.organizationId,
      auth.branchId,
      jobReference,
      parsed.data.customerId,
      parsed.data.vehicleId,
      parsed.data.assignedUserId,
      related.customer_name,
      related.customer_phone,
      related.vehicle_registration,
      related.vehicle_type_name,
      related.vehicle_make,
      related.vehicle_model,
      status,
      bill.subtotalMinor,
      bill.couponDiscountMinor,
      bill.referralDiscountMinor,
      bill.rewardDiscountMinor,
      bill.manualDiscountMinor,
      bill.totalDiscountMinor,
      bill.taxableAmountMinor,
      bill.taxMinor,
      bill.roundingMinor,
      bill.totalAmountMinor,
      bill.totalAmountMinor,
      taxRate,
      status === "IN_PROGRESS" ? now.toISOString() : null,
      parsed.data.location.place || null,
      parsed.data.location.capturedAt ?? null,
      parsed.data.notes ?? null,
      parsed.data.manualDiscountReason ?? null,
      auth.userId,
      auth.userId,
      now.toISOString(),
      now.toISOString(),
    ),
    ...selectedServices.map((service, index) => {
      const discount = discounts[index] ?? 0;
      const tax = taxes[index] ?? 0;
      return c.env.DB.prepare(
        `INSERT INTO wash_job_items (id, wash_job_id, service_id, item_kind, service_code_snapshot, service_name_snapshot, description_snapshot, quantity, unit_price_minor, line_subtotal_minor, discount_minor, taxable_amount_minor, tax_rate_basis_points, tax_minor, line_total_minor, estimated_duration_minutes, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        jobId,
        service.id,
        service.service_kind,
        service.code,
        service.name,
        service.description,
        service.price_minor,
        service.price_minor,
        discount,
        service.price_minor - discount,
        taxRate,
        tax,
        service.price_minor - discount + tax,
        service.estimated_duration_minutes,
        index,
        now.toISOString(),
      );
    }),
    c.env.DB.prepare(
      `INSERT INTO vehicle_photos (id, organization_id, wash_job_id, vehicle_id, customer_id, file_asset_id, photo_type, capture_source, is_mandatory_capture, captured_at, captured_by_user_id, width_pixels, height_pixels, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, 'LIVE_BEFORE_WASH', 'CAMERA', 1, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      photoId,
      auth.organizationId,
      jobId,
      parsed.data.vehicleId,
      parsed.data.customerId,
      parsed.data.photoAssetId,
      String(photoMetadata["capturedAt"] ?? now.toISOString()),
      auth.userId,
      Number(photoMetadata["width"] ?? 0) || null,
      Number(photoMetadata["height"] ?? 0) || null,
      JSON.stringify(photoMetadata),
      now.toISOString(),
    ),
    c.env.DB.prepare(
      `INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, response_status, response_body_json, resource_type, resource_id, state, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, 'WASH_JOB_CREATE', ?, 201, ?, 'WASH_JOB', ?, 'COMPLETED', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      auth.organizationId,
      auth.userId,
      parsed.data.idempotencyKey,
      requestHash,
      JSON.stringify({ id: jobId }),
      jobId,
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
      now.toISOString(),
    ),
    auditStatement(c.env, {
      action: "WASH_JOB_CREATED",
      auth,
      next: { bill, jobId, jobReference, serviceIds },
      reason: parsed.data.manualDiscountReason ?? null,
      recordId: jobId,
      recordType: "WASH_JOB",
      requestId: c.get("requestId"),
      severity: bill.manualDiscountMinor > 0 ? "WARNING" : "INFO",
    }),
  ];
  if (status === "IN_PROGRESS") {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO timer_events (id, wash_job_id, event_type, event_at, performed_by_user_id, source, created_at) VALUES (?, ?, 'START', ?, ?, 'USER', ?)",
      ).bind(
        crypto.randomUUID(),
        jobId,
        now.toISOString(),
        auth.userId,
        now.toISOString(),
      ),
    );
  }
  if (coupon !== null) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO coupon_redemptions (id, coupon_id, customer_id, wash_job_id, status, original_amount_minor, discount_amount_minor, coupon_code_snapshot, discount_type_snapshot, discount_value_snapshot, reserved_at, created_by_user_id) VALUES (?, ?, ?, ?, 'RESERVED', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        coupon.id,
        parsed.data.customerId,
        jobId,
        bill.subtotalMinor,
        bill.couponDiscountMinor,
        coupon.code,
        coupon.discount_type,
        coupon.discount_value,
        now.toISOString(),
        auth.userId,
      ),
      c.env.DB.prepare(
        "UPDATE coupons SET total_usage_count_cached = total_usage_count_cached + 1, updated_at = ?, version = version + 1 WHERE id = ?",
      ).bind(now.toISOString(), coupon.id),
    );
  }
  if (referral !== null) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO referral_redemptions (id, organization_id, referral_code_id, referring_customer_id, referred_customer_id, referred_wash_job_id, status, friend_discount_type_snapshot, friend_discount_value_snapshot, friend_discount_minor, reward_type_snapshot, reward_value_snapshot, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        auth.organizationId,
        referral.codeId,
        referral.referrerCustomerId,
        parsed.data.customerId,
        jobId,
        stringSetting(settings, "referral.friend_discount_type", "FIXED"),
        integerSetting(settings, "referral.friend_discount_value", 0),
        referral.discountMinor,
        referral.rewardType,
        referral.rewardValue,
        now.toISOString(),
        auth.userId,
      ),
    );
  }
  if (reward !== null) {
    const remaining = reward.amountMinor;
    statements.push(
      c.env.DB.prepare(
        "UPDATE referral_rewards SET status = 'RESERVED', reserved_for_wash_job_id = ?, remaining_amount_minor = remaining_amount_minor - ?, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'AVAILABLE' AND version = ? AND remaining_amount_minor >= ?",
      ).bind(
        jobId,
        remaining,
        now.toISOString(),
        reward.id,
        reward.version,
        remaining,
      ),
      c.env.DB.prepare(
        "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) SELECT ?, id, customer_id, ?, 'RESERVE', ?, remaining_amount_minor, ?, ? FROM referral_rewards WHERE id = ? AND reserved_for_wash_job_id = ?",
      ).bind(
        crypto.randomUUID(),
        jobId,
        remaining,
        auth.userId,
        now.toISOString(),
        reward.id,
        jobId,
      ),
    );
  }
  await c.env.DB.batch(statements);
  const created = await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
    .bind(jobId)
    .first();
  return c.json({ data: created, success: true }, 201);
});

washJobRoutes.get(
  "/assignable-users",
  requirePermission("wash_jobs.create"),
  async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      `SELECT id, full_name, role
       FROM users
       WHERE organization_id = ? AND default_branch_id = ? AND status = 'ACTIVE'
       ORDER BY full_name`,
    )
      .bind(auth.organizationId, auth.branchId)
      .all();
    return c.json({ data: result.results, success: true });
  },
);

washJobRoutes.get("/:id", requirePermission("wash_jobs.read"), async (c) => {
  const auth = c.get("auth");
  const job = await c.env.DB.prepare(
    "SELECT * FROM wash_jobs WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (job === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
  const [items, photos, locations] = await Promise.all([
    c.env.DB.prepare(
      "SELECT * FROM wash_job_items WHERE wash_job_id = ? ORDER BY display_order",
    )
      .bind(c.req.param("id"))
      .all(),
    c.env.DB.prepare(
      "SELECT vp.*, fa.mime_type, fa.size_bytes FROM vehicle_photos vp INNER JOIN file_assets fa ON fa.id = vp.file_asset_id WHERE vp.wash_job_id = ? AND vp.organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .all(),
    c.env.DB.prepare(
      "SELECT * FROM location_captures WHERE wash_job_id = ? AND organization_id = ? ORDER BY captured_at",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .all(),
  ]);
  return c.json({
    data: {
      ...job,
      items: items.results,
      locations: locations.results,
      photos: photos.results,
    },
    success: true,
  });
});

washJobRoutes.patch(
  "/:id/assignment",
  requirePermission("wash_jobs.assign"),
  async (c) => {
    const parsed = assignmentSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Select an active Staff member and current job version.",
      );
    const auth = c.get("auth");
    const previous = await c.env.DB.prepare(
      "SELECT id, assigned_user_id, status, version FROM wash_jobs WHERE id = ? AND organization_id = ? AND branch_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId, auth.branchId)
      .first<{
        assigned_user_id: string;
        id: string;
        status: string;
        version: number;
      }>();
    if (previous === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    if (["COMPLETED", "CANCELLED"].includes(previous.status))
      throw new ApiError(
        409,
        "INVALID_JOB_STATUS",
        "Completed and cancelled jobs are locked from normal editing.",
      );
    const assignee = await c.env.DB.prepare(
      "SELECT id, full_name FROM users WHERE id = ? AND organization_id = ? AND default_branch_id = ? AND status = 'ACTIVE'",
    )
      .bind(parsed.data.assignedUserId, auth.organizationId, auth.branchId)
      .first<{ full_name: string; id: string }>();
    if (assignee === null)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Select an active user at this branch.",
      );
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE wash_jobs SET assigned_user_id = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status NOT IN ('COMPLETED', 'CANCELLED')",
    )
      .bind(
        assignee.id,
        auth.userId,
        now,
        previous.id,
        auth.organizationId,
        parsed.data.version,
      )
      .run();
    if (result.meta.changes === 0)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The job changed on another device.",
      );
    await auditStatement(c.env, {
      action: "WASH_JOB_ASSIGNED",
      auth,
      next: {
        assignedUserId: assignee.id,
        assignedUserName: assignee.full_name,
      },
      previous: { assignedUserId: previous.assigned_user_id },
      reason: parsed.data.reason ?? null,
      recordId: previous.id,
      recordType: "WASH_JOB",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }).run();
    return c.json({
      data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
        .bind(previous.id)
        .first(),
      success: true,
    });
  },
);

for (const [path, action, event] of [
  ["start", "START", "START"],
  ["pause", "PAUSE", "PAUSE"],
  ["resume", "RESUME", "RESUME"],
] as const) {
  washJobRoutes.post(
    `/:id/${path}`,
    requirePermission(`wash_jobs.${path}` as "wash_jobs.start"),
    async (c) => {
      const parsed = actionSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "The current job version is required.",
        );
      const auth = c.get("auth");
      const job = await c.env.DB.prepare(
        "SELECT id, organization_id, status, version FROM wash_jobs WHERE id = ? AND organization_id = ?",
      )
        .bind(c.req.param("id"), auth.organizationId)
        .first<JobRow>();
      if (job === null)
        throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
      if (job.version !== parsed.data.version)
        throw new ApiError(
          409,
          "RESOURCE_CONFLICT",
          "The job changed on another device.",
        );
      let nextStatus: WashJobStatus;
      try {
        nextStatus = getNextStatus(job.status, action);
      } catch {
        throw new ApiError(
          409,
          "INVALID_TIMER_TRANSITION",
          "That timer action is no longer valid.",
        );
      }
      const now = new Date().toISOString();
      const eventId = crypto.randomUUID();
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE wash_jobs SET status = ?, started_at = CASE WHEN ? = 'START' THEN COALESCE(started_at, ?) ELSE started_at END, paused_at = CASE WHEN ? = 'PAUSE' THEN ? WHEN ? = 'RESUME' THEN NULL ELSE paused_at END, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND status = ? AND version = ?`,
        ).bind(
          nextStatus,
          event,
          now,
          event,
          now,
          event,
          auth.userId,
          now,
          job.id,
          auth.organizationId,
          job.status,
          job.version,
        ),
        c.env.DB.prepare(
          `INSERT INTO timer_events (id, wash_job_id, event_type, event_at, performed_by_user_id, source, created_at) SELECT ?, id, ?, ?, ?, 'USER', ? FROM wash_jobs WHERE id = ? AND organization_id = ? AND status = ? AND version = ?`,
        ).bind(
          eventId,
          event,
          now,
          auth.userId,
          now,
          job.id,
          auth.organizationId,
          nextStatus,
          job.version + 1,
        ),
      ]);
      const inserted = await c.env.DB.prepare(
        "SELECT 1 FROM timer_events WHERE id = ?",
      )
        .bind(eventId)
        .first();
      if (inserted === null)
        throw new ApiError(
          409,
          "INVALID_TIMER_TRANSITION",
          "Another device already changed this timer.",
        );
      return c.json({
        data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
          .bind(job.id)
          .first(),
        success: true,
      });
    },
  );
}

washJobRoutes.post(
  "/:id/queue",
  requirePermission("wash_jobs.assign"),
  async (c) => {
    const parsed = actionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "The current job version is required.",
      );
    const auth = c.get("auth");
    const job = await c.env.DB.prepare(
      "SELECT id, status, version FROM wash_jobs WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<JobRow>();
    if (job === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    if (job.version !== parsed.data.version)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The job changed on another device.",
      );
    try {
      getNextStatus(job.status, "QUEUE");
    } catch {
      throw new ApiError(
        409,
        "INVALID_JOB_STATUS",
        "Only a Draft job can enter the waiting queue.",
      );
    }
    const now = new Date().toISOString();
    const result = await c.env.DB.prepare(
      "UPDATE wash_jobs SET status = 'WAITING', updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND status = 'DRAFT' AND version = ?",
    )
      .bind(auth.userId, now, job.id, auth.organizationId, job.version)
      .run();
    if (result.meta.changes === 0)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "Another device changed this Draft.",
      );
    await auditStatement(c.env, {
      action: "WASH_JOB_QUEUED",
      auth,
      recordId: job.id,
      recordType: "WASH_JOB",
      requestId: c.get("requestId"),
    }).run();
    return c.json({
      data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
        .bind(job.id)
        .first(),
      success: true,
    });
  },
);

washJobRoutes.post(
  "/:id/complete",
  requirePermission("wash_jobs.complete"),
  async (c) => {
    const parsed = actionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "The current job version is required.",
      );
    const auth = c.get("auth");
    const job = await c.env.DB.prepare(
      "SELECT id, organization_id, status, version FROM wash_jobs WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<JobRow>();
    if (job === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    if (job.version !== parsed.data.version)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The job changed on another device.",
      );
    try {
      getNextStatus(job.status, "END");
    } catch {
      throw new ApiError(
        409,
        "INVALID_TIMER_TRANSITION",
        "Only an active or paused wash can be completed.",
      );
    }
    const existing = await c.env.DB.prepare(
      "SELECT event_type AS type, event_at AS at FROM timer_events WHERE wash_job_id = ? ORDER BY event_at, created_at",
    )
      .bind(job.id)
      .all<{ at: string; type: "START" | "PAUSE" | "RESUME" | "END" }>();
    const now = new Date().toISOString();
    const timer = calculateTimer(
      [...existing.results, { at: now, type: "END" }],
      now,
    );
    const eventId = crypto.randomUUID();
    const reservedReward = await c.env.DB.prepare(
      `SELECT rw.id, rw.customer_id, rw.remaining_amount_minor,
      rrt.amount_minor AS reserved_amount_minor
     FROM referral_rewards rw
     INNER JOIN referral_reward_transactions rrt ON rrt.referral_reward_id = rw.id
       AND rrt.wash_job_id = ? AND rrt.transaction_type = 'RESERVE'
     WHERE rw.reserved_for_wash_job_id = ? AND rw.status = 'RESERVED'
     ORDER BY rrt.created_at DESC LIMIT 1`,
    )
      .bind(job.id, job.id)
      .first<{
        customer_id: string;
        id: string;
        remaining_amount_minor: number;
        reserved_amount_minor: number;
      }>();
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        "UPDATE wash_jobs SET status = 'COMPLETED', completed_at = ?, paused_at = NULL, total_active_seconds = ?, total_paused_seconds = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND status = ? AND version = ?",
      ).bind(
        now,
        timer.activeSeconds,
        timer.pausedSeconds,
        auth.userId,
        now,
        job.id,
        auth.organizationId,
        job.status,
        job.version,
      ),
      c.env.DB.prepare(
        "INSERT INTO timer_events (id, wash_job_id, event_type, event_at, performed_by_user_id, source, created_at) SELECT ?, id, 'END', ?, ?, 'USER', ? FROM wash_jobs WHERE id = ? AND status = 'COMPLETED' AND version = ?",
      ).bind(eventId, now, auth.userId, now, job.id, job.version + 1),
      c.env.DB.prepare(
        "UPDATE coupon_redemptions SET status = 'REDEEMED', redeemed_at = ? WHERE wash_job_id = ? AND status = 'RESERVED'",
      ).bind(now, job.id),
      c.env.DB.prepare(
        "UPDATE customers SET total_visits_cached = total_visits_cached + 1, total_spent_minor_cached = total_spent_minor_cached + COALESCE((SELECT total_amount_minor FROM wash_jobs WHERE id = ?), 0), last_visit_at = ?, updated_at = ?, version = version + 1 WHERE id = (SELECT customer_id FROM wash_jobs WHERE id = ?)",
      ).bind(job.id, now, now, job.id),
      c.env.DB.prepare(
        "UPDATE vehicles SET last_wash_at = ?, updated_at = ?, version = version + 1 WHERE id = (SELECT vehicle_id FROM wash_jobs WHERE id = ?)",
      ).bind(now, now, job.id),
      auditStatement(c.env, {
        action: "WASH_JOB_COMPLETED",
        auth,
        next: timer,
        recordId: job.id,
        recordType: "WASH_JOB",
        requestId: c.get("requestId"),
      }),
    ];
    if (reservedReward !== null) {
      statements.push(
        c.env.DB.prepare(
          "UPDATE referral_rewards SET status = CASE WHEN remaining_amount_minor = 0 THEN 'USED' ELSE 'AVAILABLE' END, reserved_for_wash_job_id = NULL, used_at = CASE WHEN remaining_amount_minor = 0 THEN ? ELSE used_at END, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'RESERVED' AND reserved_for_wash_job_id = ?",
        ).bind(now, now, reservedReward.id, job.id),
        c.env.DB.prepare(
          "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'REDEEM', ?, ?, ?, ?)",
        ).bind(
          crypto.randomUUID(),
          reservedReward.id,
          reservedReward.customer_id,
          job.id,
          reservedReward.reserved_amount_minor,
          reservedReward.remaining_amount_minor,
          auth.userId,
          now,
        ),
      );
    }
    await c.env.DB.batch(statements);
    if (
      (await c.env.DB.prepare("SELECT 1 FROM timer_events WHERE id = ?")
        .bind(eventId)
        .first()) === null
    )
      throw new ApiError(
        409,
        "INVALID_TIMER_TRANSITION",
        "Another device already changed this timer.",
      );
    return c.json({
      data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
        .bind(job.id)
        .first(),
      success: true,
    });
  },
);

washJobRoutes.post(
  "/:id/cancel",
  requirePermission("wash_jobs.cancel"),
  async (c) => {
    const parsed = cancelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "A cancellation reason and current version are required.",
      );
    const auth = c.get("auth");
    const job = await c.env.DB.prepare(
      "SELECT id, status, version FROM wash_jobs WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<JobRow>();
    if (job === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    if (job.version !== parsed.data.version)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The job changed on another device.",
      );
    try {
      getNextStatus(job.status, "CANCEL");
    } catch {
      throw new ApiError(
        409,
        "INVALID_JOB_STATUS",
        "Completed or cancelled jobs cannot be cancelled.",
      );
    }
    const now = new Date().toISOString();
    const couponId = await c.env.DB.prepare(
      "SELECT coupon_id FROM coupon_redemptions WHERE wash_job_id = ? AND status = 'RESERVED'",
    )
      .bind(job.id)
      .first<string>("coupon_id");
    const reservedReward = await c.env.DB.prepare(
      `SELECT rw.id, rw.customer_id, rw.remaining_amount_minor,
      rrt.amount_minor AS reserved_amount_minor
     FROM referral_rewards rw
     INNER JOIN referral_reward_transactions rrt ON rrt.referral_reward_id = rw.id
       AND rrt.wash_job_id = ? AND rrt.transaction_type = 'RESERVE'
     WHERE rw.reserved_for_wash_job_id = ? AND rw.status = 'RESERVED'
     ORDER BY rrt.created_at DESC LIMIT 1`,
    )
      .bind(job.id, job.id)
      .first<{
        customer_id: string;
        id: string;
        remaining_amount_minor: number;
        reserved_amount_minor: number;
      }>();
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        "UPDATE wash_jobs SET status = 'CANCELLED', payment_status = 'CANCELLED', cancellation_reason = ?, cancelled_at = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND status = ? AND version = ?",
      ).bind(
        parsed.data.reason,
        now,
        auth.userId,
        now,
        job.id,
        auth.organizationId,
        job.status,
        job.version,
      ),
      c.env.DB.prepare(
        "UPDATE coupon_redemptions SET status = 'RELEASED', released_at = ? WHERE wash_job_id = ? AND status = 'RESERVED'",
      ).bind(now, job.id),
      c.env.DB.prepare(
        "UPDATE referral_redemptions SET status = 'CANCELLED', cancelled_at = ?, cancellation_reason = ? WHERE referred_wash_job_id = ? AND status IN ('PENDING', 'QUALIFIED')",
      ).bind(now, parsed.data.reason, job.id),
      auditStatement(c.env, {
        action: "WASH_JOB_CANCELLED",
        auth,
        reason: parsed.data.reason,
        recordId: job.id,
        recordType: "WASH_JOB",
        requestId: c.get("requestId"),
        severity: "WARNING",
      }),
    ];
    if (couponId !== null)
      statements.push(
        c.env.DB.prepare(
          "UPDATE coupons SET total_usage_count_cached = CASE WHEN total_usage_count_cached > 0 THEN total_usage_count_cached - 1 ELSE 0 END, updated_at = ?, version = version + 1 WHERE id = ?",
        ).bind(now, couponId),
      );
    if (reservedReward !== null) {
      statements.push(
        c.env.DB.prepare(
          "UPDATE referral_rewards SET status = 'AVAILABLE', remaining_amount_minor = remaining_amount_minor + ?, reserved_for_wash_job_id = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'RESERVED' AND reserved_for_wash_job_id = ?",
        ).bind(
          reservedReward.reserved_amount_minor,
          now,
          reservedReward.id,
          job.id,
        ),
        c.env.DB.prepare(
          "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, wash_job_id, transaction_type, amount_minor, balance_after_minor, reason, performed_by_user_id, created_at) VALUES (?, ?, ?, ?, 'RELEASE', ?, ?, 'WASH_JOB_CANCELLED', ?, ?)",
        ).bind(
          crypto.randomUUID(),
          reservedReward.id,
          reservedReward.customer_id,
          job.id,
          reservedReward.reserved_amount_minor,
          reservedReward.remaining_amount_minor +
            reservedReward.reserved_amount_minor,
          auth.userId,
          now,
        ),
      );
    }
    await c.env.DB.batch(statements);
    return c.json({
      data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
        .bind(job.id)
        .first(),
      success: true,
    });
  },
);

washJobRoutes.post(
  "/:id/timer-adjustments",
  requireAdmin,
  requirePermission("wash_jobs.adjust"),
  async (c) => {
    const parsed = timerAdjustmentSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "A valid timer correction, reason, and job version are required.",
      );
    const auth = c.get("auth");
    const job = await c.env.DB.prepare(
      "SELECT id, status, started_at, completed_at, total_active_seconds, total_paused_seconds, version FROM wash_jobs WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first<{
        completed_at: string | null;
        id: string;
        started_at: string | null;
        status: string;
        total_active_seconds: number;
        total_paused_seconds: number;
        version: number;
      }>();
    if (job === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    if (job.version !== parsed.data.version)
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "The job changed on another device.",
      );
    if (job.status !== "COMPLETED")
      throw new ApiError(
        409,
        "INVALID_JOB_STATUS",
        "Timer corrections are available only after completion.",
      );
    let column:
      | "started_at"
      | "completed_at"
      | "total_active_seconds"
      | "total_paused_seconds";
    let previousValue: string;
    let nextValue: string | number;
    if (
      parsed.data.adjustmentType === "START_TIME_CORRECTION" ||
      parsed.data.adjustmentType === "END_TIME_CORRECTION"
    ) {
      const timestamp = Date.parse(parsed.data.newValue);
      if (!Number.isFinite(timestamp))
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "Enter a valid corrected server timestamp.",
        );
      nextValue = new Date(timestamp).toISOString();
      if (parsed.data.adjustmentType === "START_TIME_CORRECTION") {
        column = "started_at";
        previousValue = job.started_at ?? "";
        if (
          job.completed_at !== null &&
          timestamp > Date.parse(job.completed_at)
        )
          throw new ApiError(
            422,
            "VALIDATION_ERROR",
            "The corrected start must be before completion.",
          );
      } else {
        column = "completed_at";
        previousValue = job.completed_at ?? "";
        if (job.started_at !== null && timestamp < Date.parse(job.started_at))
          throw new ApiError(
            422,
            "VALIDATION_ERROR",
            "The corrected completion must be after the start.",
          );
      }
    } else {
      const seconds = Number(parsed.data.newValue);
      if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 31_536_000)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "Enter a valid corrected duration in seconds.",
        );
      nextValue = seconds;
      if (parsed.data.adjustmentType === "ACTIVE_DURATION_CORRECTION") {
        column = "total_active_seconds";
        previousValue = String(job.total_active_seconds);
      } else {
        column = "total_paused_seconds";
        previousValue = String(job.total_paused_seconds);
      }
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE wash_jobs SET ${column} = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ? AND version = ? AND status = 'COMPLETED'`,
      ).bind(
        nextValue,
        auth.userId,
        now,
        job.id,
        auth.organizationId,
        job.version,
      ),
      c.env.DB.prepare(
        "INSERT INTO timer_adjustments (id, wash_job_id, adjustment_type, previous_value, new_value, reason, approved_by_user_id, created_at) SELECT ?, id, ?, ?, ?, ?, ?, ? FROM wash_jobs WHERE id = ? AND organization_id = ? AND version = ?",
      ).bind(
        id,
        parsed.data.adjustmentType,
        previousValue,
        String(nextValue),
        parsed.data.reason,
        auth.userId,
        now,
        job.id,
        auth.organizationId,
        job.version + 1,
      ),
      auditStatement(c.env, {
        action: "WASH_TIMER_CORRECTED",
        auth,
        next: {
          adjustmentType: parsed.data.adjustmentType,
          newValue: nextValue,
        },
        previous: { value: previousValue },
        reason: parsed.data.reason,
        recordId: job.id,
        recordType: "WASH_JOB",
        requestId: c.get("requestId"),
        severity: "CRITICAL",
      }),
    ]);
    if (
      (results[0]?.meta.changes ?? 0) === 0 ||
      (await c.env.DB.prepare("SELECT 1 FROM timer_adjustments WHERE id = ?")
        .bind(id)
        .first()) === null
    )
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "Another device changed this timer.",
      );
    return c.json(
      {
        data: await c.env.DB.prepare("SELECT * FROM wash_jobs WHERE id = ?")
          .bind(job.id)
          .first(),
        success: true,
      },
      201,
    );
  },
);

washJobRoutes.get(
  "/:id/timer",
  requirePermission("wash_jobs.read"),
  async (c) => {
    const auth = c.get("auth");
    const job = await c.env.DB.prepare(
      "SELECT id, status FROM wash_jobs WHERE id = ? AND organization_id = ?",
    )
      .bind(c.req.param("id"), auth.organizationId)
      .first();
    if (job === null)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");
    const events = await c.env.DB.prepare(
      "SELECT id, event_type, event_at, performed_by_user_id, reason, source, created_at FROM timer_events WHERE wash_job_id = ? ORDER BY event_at, created_at",
    )
      .bind(c.req.param("id"))
      .all();
    const adjustments = await c.env.DB.prepare(
      "SELECT * FROM timer_adjustments WHERE wash_job_id = ? ORDER BY created_at",
    )
      .bind(c.req.param("id"))
      .all();
    return c.json({
      data: { adjustments: adjustments.results, events: events.results, job },
      success: true,
    });
  },
);

washJobRoutes.get(
  "/:id/history",
  requirePermission("wash_jobs.read"),
  async (c) => {
    const auth = c.get("auth");
    const result = await c.env.DB.prepare(
      "SELECT * FROM audit_logs WHERE organization_id = ? AND record_type = 'WASH_JOB' AND record_id = ? ORDER BY created_at",
    )
      .bind(auth.organizationId, c.req.param("id"))
      .all();
    return c.json({ data: result.results, success: true });
  },
);
