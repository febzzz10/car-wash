import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import type { AppBindings } from "../types";

const settingGroups = {
  business: new Set([
    "business.name",
    "business.legal_name",
    "business.logo_asset_id",
    "business.address",
    "business.phone",
    "business.whatsapp",
    "business.email",
    "business.tax_number",
    "business.currency",
    "business.working_hours",
    "business.timezone",
    "business.date_format",
    "business.number_format",
    "payment.default_method",
  ]),
  invoice: new Set([
    "invoice.prefix",
    "invoice.footer",
    "invoice.thank_you_message",
    "invoice.terms",
  ]),
  tax: new Set([
    "tax.enabled",
    "tax.rate_basis_points",
    "billing.rounding_mode",
  ]),
  location: new Set([
    "location.latitude",
    "location.longitude",
    "location.allowed_radius_meters",
    "location.minimum_gps_accuracy_meters",
  ]),
  referral: new Set([
    "referral.enabled",
    "referral.friend_discount_type",
    "referral.friend_discount_value",
    "referral.reward_type",
    "referral.reward_value",
    "referral.minimum_bill_minor",
    "referral.maximum_discount_minor",
    "referral.reward_maximum_minor",
    "referral.reward_expiry_days",
    "referral.new_customers_only",
    "referral.eligible_service_ids",
    "referral.eligible_vehicle_type_ids",

  ]),
  security: new Set([
    "security.session_timeout_minutes",
    "privacy.photo_retention_days",
    "privacy.location_retention_days",
    "privacy.temporary_file_retention_days",
    "privacy.audit_retention_days",
    "privacy.login_attempt_retention_days",
  ]),
} as const;

const valueSchema = z.union([
  z.string().max(5000),
  z.number().safe(),
  z.boolean(),
  z.array(z.string().max(64)).max(100),
  z.record(z.string(), z.unknown()),
]);
const patchSchema = z.object({
  settings: z.record(z.string(), valueSchema),
});

function settingValue(value: z.infer<typeof valueSchema>): {
  readonly text: string;
  readonly type: "STRING" | "INTEGER" | "BOOLEAN" | "JSON";
} {
  if (typeof value === "boolean")
    return { text: String(value), type: "BOOLEAN" };
  if (typeof value === "number") {
    if (!Number.isInteger(value))
      return { text: JSON.stringify(value), type: "JSON" };
    return { text: String(value), type: "INTEGER" };
  }
  if (typeof value === "string") return { text: value, type: "STRING" };
  return { text: JSON.stringify(value), type: "JSON" };
}

export const settingRoutes = new Hono<AppBindings>();

settingRoutes.use("*", requireAdmin);

settingRoutes.get("/", requirePermission("settings.manage"), async (c) => {
  const auth = c.get("auth");
  const [settings, organization, branch] = await Promise.all([
    c.env.DB.prepare(
      "SELECT setting_key, value_type, value_text, updated_at, version FROM business_settings WHERE organization_id = ? AND (branch_id IS NULL OR branch_id = ?) ORDER BY setting_key",
    )
      .bind(auth.organizationId, auth.branchId)
      .all(),
    c.env.DB.prepare(
      "SELECT id, legal_name, display_name, default_currency, default_timezone, version FROM organizations WHERE id = ?",
    )
      .bind(auth.organizationId)
      .first(),
    c.env.DB.prepare(
      "SELECT * FROM branches WHERE id = ? AND organization_id = ?",
    )
      .bind(auth.branchId, auth.organizationId)
      .first(),
  ]);
  return c.json({
    data: { branch, organization, settings: settings.results },
    success: true,
  });
});

for (const group of Object.keys(
  settingGroups,
) as (keyof typeof settingGroups)[]) {
  settingRoutes.patch(
    `/${group}`,
    requirePermission("settings.manage"),
    async (c) => {
      const parsed = patchSchema.safeParse(
        await c.req.json().catch(() => null),
      );
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          "Check the setting values.",
        );
      const invalid = Object.keys(parsed.data.settings).filter(
        (key) => !settingGroups[group].has(key as never),
      );
      if (invalid.length > 0)
        throw new ApiError(
          422,
          "VALIDATION_ERROR",
          `Unsupported ${group} setting: ${invalid[0] ?? "unknown"}.`,
        );
      const auth = c.get("auth");
      if (auth.branchId === null)
        throw new ApiError(422, "VALIDATION_ERROR", "Select a branch first.");
      const previousRows = await c.env.DB.prepare(
        "SELECT setting_key, value_type, value_text, version FROM business_settings WHERE organization_id = ? AND (branch_id IS NULL OR branch_id = ?)",
      )
        .bind(auth.organizationId, auth.branchId)
        .all<{
          setting_key: string;
          value_text: string;
          value_type: string;
          version: number;
        }>();
      const previous = new Map(
        previousRows.results.map((row) => [row.setting_key, row]),
      );
      const now = new Date().toISOString();
      const statements: D1PreparedStatement[] = [];
      for (const [key, rawValue] of Object.entries(parsed.data.settings)) {
        const value = settingValue(rawValue);
        const existing = previous.get(key);
        if (existing === undefined) {
          statements.push(
            c.env.DB.prepare(
              "INSERT INTO business_settings (id, organization_id, branch_id, setting_key, value_type, value_text, updated_by_user_id, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
            ).bind(
              crypto.randomUUID(),
              auth.organizationId,
              key,
              value.type,
              value.text,
              auth.userId,
              now,
            ),
          );
        } else {
          statements.push(
            c.env.DB.prepare(
              "UPDATE business_settings SET value_type = ?, value_text = ?, updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE organization_id = ? AND setting_key = ? AND (branch_id IS NULL OR branch_id = ?)",
            ).bind(
              value.type,
              value.text,
              auth.userId,
              now,
              auth.organizationId,
              key,
              auth.branchId,
            ),
          );
        }
      }
      if (group === "business") {
        const displayName = parsed.data.settings["business.name"];
        const legalName = parsed.data.settings["business.legal_name"];
        const currency = parsed.data.settings["business.currency"];
        const timezone = parsed.data.settings["business.timezone"];
        statements.push(
          c.env.DB.prepare(
            "UPDATE organizations SET display_name = COALESCE(?, display_name), legal_name = COALESCE(?, legal_name), default_currency = COALESCE(?, default_currency), default_timezone = COALESCE(?, default_timezone), updated_at = ?, version = version + 1 WHERE id = ?",
          ).bind(
            typeof displayName === "string" ? displayName : null,
            typeof legalName === "string" ? legalName : null,
            typeof currency === "string" ? currency : null,
            typeof timezone === "string" ? timezone : null,
            now,
            auth.organizationId,
          ),
        );
        const address = parsed.data.settings["business.address"];
        const phone = parsed.data.settings["business.phone"];
        const whatsapp = parsed.data.settings["business.whatsapp"];
        const email = parsed.data.settings["business.email"];
        statements.push(
          c.env.DB.prepare(
            "UPDATE branches SET address_line_1 = COALESCE(?, address_line_1), phone = COALESCE(?, phone), whatsapp_number = COALESCE(?, whatsapp_number), email = COALESCE(?, email), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
          ).bind(
            typeof address === "string" ? address : null,
            typeof phone === "string" ? phone : null,
            typeof whatsapp === "string" ? whatsapp : null,
            typeof email === "string" ? email : null,
            now,
            auth.branchId,
            auth.organizationId,
          ),
        );
      }
      if (group === "location") {
        const latitude = parsed.data.settings["location.latitude"];
        const longitude = parsed.data.settings["location.longitude"];
        const radius = parsed.data.settings["location.allowed_radius_meters"];
        const accuracy =
          parsed.data.settings["location.minimum_gps_accuracy_meters"];
        const numeric = [latitude, longitude, radius, accuracy].every(
          (value) => value === undefined || typeof value === "number",
        );
        if (
          !numeric ||
          (typeof latitude === "number" && (latitude < -90 || latitude > 90)) ||
          (typeof longitude === "number" &&
            (longitude < -180 || longitude > 180)) ||
          (typeof radius === "number" && radius <= 0) ||
          (typeof accuracy === "number" && accuracy <= 0)
        ) {
          throw new ApiError(
            422,
            "VALIDATION_ERROR",
            "Enter valid GPS coordinates, radius, and accuracy.",
          );
        }
        statements.push(
          c.env.DB.prepare(
            "UPDATE branches SET latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), allowed_radius_meters = COALESCE(?, allowed_radius_meters), minimum_gps_accuracy_meters = COALESCE(?, minimum_gps_accuracy_meters), updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
          ).bind(
            latitude ?? null,
            longitude ?? null,
            radius ?? null,
            accuracy ?? null,
            now,
            auth.branchId,
            auth.organizationId,
          ),
        );
      }
      statements.push(
        auditStatement(c.env, {
          action: "BUSINESS_SETTINGS_UPDATED",
          auth,
          next: parsed.data.settings,
          previous: Object.fromEntries(
            [...previous.entries()].filter(
              ([key]) => key in parsed.data.settings,
            ),
          ),
          recordType: "BUSINESS_SETTINGS",
          requestId: c.get("requestId"),
          severity:
            group === "security" || group === "tax" ? "WARNING" : "INFO",
        }),
      );
      await c.env.DB.batch(statements);
      return c.json({
        data: { group, settings: parsed.data.settings },
        success: true,
      });
    },
  );
}
