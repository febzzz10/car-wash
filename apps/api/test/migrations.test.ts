import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const expectedTables = [
  "audit_logs",
  "branches",
  "business_settings",
  "coupon_eligible_services",
  "coupon_eligible_vehicle_types",
  "coupons",
  "coupon_redemptions",
  "customers",
  "expense_attachments",
  "expense_categories",
  "expenses",
  "file_assets",
  "financial_operation_guards",
  "idempotency_keys",
  "invoice_items",
  "invoices",
  "location_captures",
  "login_attempts",
  "number_sequences",
  "organizations",
  "password_reset_tokens",
  "payments",
  "referral_codes",
  "referral_redemptions",
  "referral_reward_transactions",
  "referral_rewards",
  "refunds",
  "service_prices",
  "services",
  "schema_migrations",
  "timer_adjustments",
  "timer_events",
  "user_sessions",
  "users",
  "vehicle_makes",
  "vehicle_models",
  "vehicle_photos",
  "vehicle_types",
  "vehicles",
  "wash_job_items",
  "wash_jobs",
];

describe("D1 migrations", () => {
  it("creates the complete authoritative schema", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all<{ name: string }>();

    const actual = result.results
      .map(({ name }) => name)
      .filter((name) => name !== "d1_migrations");

    expect(actual).toEqual([...expectedTables].sort());
  });

  it("creates the required lookup and reconciliation indexes", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND (name LIKE 'ix_%' OR name LIKE 'ux_%')",
    ).all<{ name: string }>();
    const names = new Set(result.results.map(({ name }) => name));

    for (const requiredIndex of [
      "ix_audit_record",
      "ix_coupon_redemptions_coupon",
      "ix_coupon_redemptions_customer",
      "ux_coupon_redemption_active",
      "ix_customers_org_phone",
      "ix_expenses_date_category",
      "ix_invoices_number",
      "ix_payments_job",
      "ix_sessions_user_expiry",
      "ix_timer_events_job_time",
      "ix_vehicles_registration",
      "ix_wash_jobs_active_status",
    ]) {
      expect(names.has(requiredIndex), requiredIndex).toBe(true);
    }
  });

  it("installs database guards for tenancy, races, and sensitive audit data", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    ).all<{ name: string }>();
    const names = new Set(result.results.map(({ name }) => name));

    for (const requiredTrigger of [
      "tr_audit_no_sensitive_values",
      "tr_coupon_redemptions_limits",
      "tr_refunds_not_over_payment",
      "tr_timer_events_validate_transition",
      "tr_vehicles_scope_insert",
      "tr_wash_jobs_scope_insert",
    ]) {
      expect(names.has(requiredTrigger), requiredTrigger).toBe(true);
    }
  });
});
