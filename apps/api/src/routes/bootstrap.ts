import { normalizeEmail, normalizePhone } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { clientIp } from "../http/request";
import { hashPassword, passwordPolicyError } from "../security/passwords";
import { equalTokens } from "../security/tokens";
import { auditStatement } from "../services/audit";
import type { AppBindings, AuthContext } from "../types";

const bootstrapSchema = z.object({
  address: z.string().trim().max(500).optional(),
  adminEmail: z.string().trim().email().max(254).optional(),
  adminFullName: z.string().trim().min(2).max(120),
  adminPassword: z.string().min(12).max(256),
  adminPhone: z.string().trim().min(7).max(24).optional(),
  adminUsername: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[A-Za-z0-9._-]+$/u),
  allowedRadiusMeters: z.number().positive().max(10_000),
  branchCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/u),
  branchName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  minimumGpsAccuracyMeters: z.number().positive().max(5_000),
  timezone: z.string().trim().min(3).max(80),
});

const vehicleTypes = [
  ["TWO_WHEELER", "Two Wheeler"],
  ["THREE_WHEELER", "Three Wheeler"],
  ["FOUR_WHEELER", "Four Wheeler"],
] as const;
const expenseCategories = [
  ["CLEANING_CHEMICALS", "Cleaning Chemicals"],
  ["WATER_CHARGES", "Water Charges"],
  ["ELECTRICITY_CHARGES", "Electricity Charges"],
  ["STAFF_WAGES", "Staff Wages"],
  ["EQUIPMENT_PURCHASES", "Equipment Purchases"],
  ["EQUIPMENT_MAINTENANCE", "Equipment Maintenance"],
  ["RENT", "Rent"],
  ["MARKETING", "Marketing"],
  ["TRANSPORTATION", "Transportation"],
  ["OTHER", "Other"],
] as const;

export const bootstrapRoutes = new Hono<AppBindings>();

bootstrapRoutes.post("/", async (c) => {
  const suppliedToken = c.req.header("x-washpro-bootstrap-token") ?? "";
  if (
    c.env.BOOTSTRAP_TOKEN.length < 32 ||
    !equalTokens(suppliedToken, c.env.BOOTSTRAP_TOKEN)
  ) {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "Bootstrap authorization failed.",
    );
  }
  const existingUsers =
    (await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users",
    ).first<number>("count")) ?? 0;
  if (existingUsers > 0)
    throw new ApiError(
      409,
      "RESOURCE_CONFLICT",
      "WashPro has already been bootstrapped.",
    );
  const parsed = bootstrapSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Check the initial business and Administrator details.",
    );
  const policyError = passwordPolicyError(parsed.data.adminPassword);
  if (policyError !== null)
    throw new ApiError(422, "VALIDATION_ERROR", policyError);
  let phoneNormalized: string | null = null;
  if (parsed.data.adminPhone !== undefined) {
    try {
      phoneNormalized = normalizePhone(parsed.data.adminPhone);
    } catch {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Enter a valid Administrator phone number.",
      );
    }
  }
  const organizationId = "washpro-primary-organization";
  const branchId = "washpro-main-branch";
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(
    parsed.data.adminPassword,
    c.env.SESSION_PEPPER,
  );
  const auth: AuthContext = {
    branchId,
    organizationId,
    permissions: [],
    role: "ADMIN",
    sessionId: "bootstrap",
    userId,
    userName: parsed.data.adminFullName,
  };
  const settings: ReadonlyArray<
    readonly [string, "STRING" | "INTEGER" | "BOOLEAN", string]
  > = [
    ["business.name", "STRING", parsed.data.businessName],
    ["business.currency", "STRING", "INR"],
    ["business.timezone", "STRING", parsed.data.timezone],
    ["business.date_format", "STRING", "DD/MM/YYYY"],
    ["business.number_format", "STRING", "en-IN"],
    ["tax.enabled", "BOOLEAN", "false"],
    ["tax.rate_basis_points", "INTEGER", "0"],
    ["billing.rounding_mode", "STRING", "NONE"],
    ["invoice.prefix", "STRING", "WP"],
    ["invoice.footer", "STRING", "Generated securely by WashPro."],
    ["invoice.thank_you_message", "STRING", "Thank you for choosing us."],
    [
      "invoice.terms",
      "STRING",
      "Payment records are retained as append-only transactions.",
    ],
    ["referral.enabled", "BOOLEAN", "false"],
    ["referral.friend_discount_type", "STRING", "FIXED"],
    ["referral.friend_discount_value", "INTEGER", "0"],
    ["referral.reward_type", "STRING", "FIXED"],
    ["referral.reward_value", "INTEGER", "0"],
    ["referral.new_customers_only", "BOOLEAN", "true"],
    ["coupon.allow_referral_stacking", "BOOLEAN", "false"],
    ["payment.default_method", "STRING", "CASH"],
    ["security.session_timeout_minutes", "INTEGER", "480"],
    ["privacy.photo_retention_days", "INTEGER", "365"],
    ["privacy.location_retention_days", "INTEGER", "365"],
    ["privacy.temporary_file_retention_days", "INTEGER", "7"],
    ["privacy.audit_retention_days", "INTEGER", "2555"],
    ["privacy.login_attempt_retention_days", "INTEGER", "90"],
  ];
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      "INSERT INTO organizations (id, legal_name, display_name, default_currency, default_timezone, created_at, updated_at) VALUES (?, ?, ?, 'INR', ?, ?, ?)",
    ).bind(
      organizationId,
      parsed.data.businessName,
      parsed.data.businessName,
      parsed.data.timezone,
      now,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO branches (id, organization_id, code, name, address_line_1, latitude, longitude, allowed_radius_meters, minimum_gps_accuracy_meters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      branchId,
      organizationId,
      parsed.data.branchCode.toUpperCase(),
      parsed.data.branchName,
      parsed.data.address ?? null,
      parsed.data.latitude,
      parsed.data.longitude,
      parsed.data.allowedRadiusMeters,
      parsed.data.minimumGpsAccuracyMeters,
      now,
      now,
    ),
    c.env.DB.prepare(
      "INSERT INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, email, email_normalized, phone, phone_normalized, password_hash, role, status, permissions_json, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', 'ACTIVE', '[]', ?, ?, ?)",
    ).bind(
      userId,
      organizationId,
      branchId,
      parsed.data.adminFullName,
      parsed.data.adminUsername,
      parsed.data.adminUsername.toLowerCase(),
      parsed.data.adminEmail ?? null,
      parsed.data.adminEmail === undefined
        ? null
        : normalizeEmail(parsed.data.adminEmail),
      parsed.data.adminPhone ?? null,
      phoneNormalized,
      passwordHash,
      now,
      now,
      now,
    ),
    ...vehicleTypes.map(([code, name], index) =>
      c.env.DB.prepare(
        "INSERT INTO vehicle_types (id, organization_id, code, name, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), organizationId, code, name, index, now, now),
    ),
    ...expenseCategories.map(([code, name], index) =>
      c.env.DB.prepare(
        "INSERT INTO expense_categories (id, organization_id, code, name, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), organizationId, code, name, index, now, now),
    ),
    ...settings.map(([key, type, value]) =>
      c.env.DB.prepare(
        "INSERT INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_by_user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        organizationId,
        key,
        type,
        value,
        userId,
        now,
      ),
    ),
    auditStatement(c.env, {
      action: "SYSTEM_BOOTSTRAPPED",
      auth,
      ipAddress: clientIp(c),
      next: {
        branchCode: parsed.data.branchCode,
        branchId,
        businessName: parsed.data.businessName,
        organizationId,
        userId,
      },
      recordId: organizationId,
      recordType: "ORGANIZATION",
      requestId: c.get("requestId"),
      severity: "CRITICAL",
      userAgent: c.req.header("user-agent") ?? null,
    }),
  ];
  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE"))
      throw new ApiError(
        409,
        "RESOURCE_CONFLICT",
        "WashPro has already been bootstrapped.",
      );
    throw error;
  }
  return c.json(
    { data: { branchId, organizationId, userId }, success: true },
    201,
  );
});
