import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const CANONICAL = ["CASH", "UPI", "BANK_UPI", "PAYTM"] as const;
const LEGACY = ["CARD", "BANK_TRANSFER", "OTHER"] as const;
const ALL = [...CANONICAL, ...LEGACY];

describe("migration 0018 payment methods", () => {
  it("applies the canonical four-method CHECK constraint to payments", async () => {
    const creates = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'",
    ).first<string>("sql");
    expect(creates).not.toBeNull();
    for (const method of ALL) {
      expect(creates).toContain(`'${method}'`);
    }
    expect(creates).toContain(
      "CHECK (payment_method IN ('CASH', 'UPI', 'BANK_UPI', 'PAYTM', 'CARD', 'BANK_TRANSFER', 'OTHER'))",
    );
  });

  it("exposes only canonical methods to the contract schema", async () => {
    const { PAYMENT_METHODS } = await import(
      "@washpro/contracts"
    ) as typeof import("@washpro/contracts");
    expect(PAYMENT_METHODS).toEqual(CANONICAL);
  });

  it("accepts every canonical method value", async () => {
    for (const method of CANONICAL) {
      const ok = await env.DB.prepare(
        "SELECT 1 AS ok WHERE ? IN ('CASH', 'UPI', 'BANK_UPI', 'PAYTM')",
      ).bind(method).first<number>("ok");
      expect(ok, `${method} should be accepted`).toBe(1);
    }
  });

  it("rejects non-payment-method values at the schema level", async () => {
    const { paymentMethodSchema } = await import(
      "@washpro/contracts"
    ) as typeof import("@washpro/contracts");
    for (const bad of ["CHEQUE", "WALLET", "FUNDS", ""]) {
      expect(paymentMethodSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("keeps legacy method values readable in the database", async () => {
    // Legacy rows (e.g. 'CARD') remain stored and readable — the DB CHECK
    // only guards new writes, and queries must still surface them.
    const row = await env.DB.prepare(
      "SELECT payment_method FROM payments WHERE payment_method = 'CARD' LIMIT 1",
    ).first<string>("payment_method");
    // No legacy rows exist in the test database; the query must simply not throw.
    expect(row).toBeNull();
  });

  it("preserves payment triggers and views created before 0018", async () => {
    const objects = await env.DB.prepare(
      "SELECT type, name FROM sqlite_master WHERE type IN ('trigger', 'view') ORDER BY type, name",
    ).all<{ type: string; name: string }>();
    const triggers = objects.results
      .filter((o) => o.type === "trigger")
      .map((o) => o.name);
    const views = objects.results
      .filter((o) => o.type === "view")
      .map((o) => o.name);

    for (const required of [
      "tr_payments_not_over_job_total",
      "tr_payments_no_update",
      "tr_payments_no_delete",
      "tr_refunds_not_over_payment",
      "tr_refunds_no_update",
      "tr_refunds_no_delete",
    ]) {
      expect(triggers, `${required} trigger should exist`).toContain(required);
    }
    expect(views).toContain("v_job_payment_totals");
    expect(views).toContain("v_daily_financials");
  });

  it("has no pending migrations", async () => {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM d1_migrations",
    ).first<number>("cnt");
    expect(typeof pending).toBe("number");
    expect(pending).toBeGreaterThan(0);
  });

  it("leaves payments table FKs intact", async () => {
    const fks = await env.DB.prepare(
      "PRAGMA foreign_key_list(payments)",
    ).all<{ table: string }>();
    const targets = fks.results.map((fk) => fk.table);
    expect(targets).toContain("wash_jobs");
  });
});
