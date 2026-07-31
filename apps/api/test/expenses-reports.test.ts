import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";

const rawToken = "expense-report-session-token";
const timestamp = "2026-07-23T14:00:00.000Z";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-report', 'Report Test', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-report', 'org-report', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, organization_id, default_branch_id, full_name, username, username_normalized, password_hash, role, status, created_at, updated_at) VALUES ('admin-report', 'org-report', 'branch-report', 'Report Admin', 'report-admin', 'report-admin', 'unused', 'ADMIN', 'ACTIVE', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_sessions (id, organization_id, user_id, token_hash, status, created_at, last_seen_at, expires_at) VALUES ('session-report', 'org-report', 'admin-report', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')",
    ).bind(tokenHash, timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO expense_categories (id, organization_id, code, name, created_at, updated_at) VALUES ('category-report', 'org-report', 'CHEMICALS', 'Chemicals', ?, ?)",
    ).bind(timestamp, timestamp),
  ]);
});

async function headers(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

describe("expenses and reporting", () => {
  it("uses payment-minus-refund accounting consistently and cancels instead of deleting", async () => {
    const mutationHeaders = await headers();
    const expenseResponse = await app.request(
      "/api/v1/expenses",
      {
        body: JSON.stringify({
          amountMinor: 3000,
          categoryId: "category-report",
          description: "Car shampoo",
          expenseDate: "2026-07-23",
          idempotencyKey: "expense-key-0000001",
          paymentMethod: "UPI",
          title: "Cleaning supplies",
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(expenseResponse.status).toBe(201);
    const expense = await expenseResponse.json<{
      data: { id: string; version: number };
    }>();

    const summary = await app.request(
      "/api/v1/dashboard/summary?from=2026-07-23&to=2026-07-23",
      { headers: { cookie: mutationHeaders["cookie"] ?? "" } },
      env,
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      data: { expensesMinor: 3000, netProfitMinor: -3000, revenueMinor: 0 },
    });

    const cancelled = await app.request(
      `/api/v1/expenses/${expense.data.id}/cancel`,
      {
        body: JSON.stringify({
          reason: "Entered against wrong date",
          version: expense.data.version,
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(cancelled.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT status FROM expenses WHERE id = ?")
        .bind(expense.data.id)
        .first("status"),
    ).toBe("CANCELLED");

    const report = await app.request(
      "/api/v1/reports/profit?from=2026-07-23&to=2026-07-23",
      { headers: { cookie: mutationHeaders["cookie"] ?? "" } },
      env,
    );
    expect(report.status).toBe(200);
    expect(await report.json()).toMatchObject({
      data: { expensesMinor: 0, netProfitMinor: 0, revenueMinor: 0 },
    });

    const exported = await app.request(
      "/api/v1/reports/export",
      {
        body: JSON.stringify({
          format: "CSV",
          from: "2026-07-23",
          report: "expenses",
          to: "2026-07-23",
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("text/csv");
    const csv = await exported.text();
    expect(csv.split("\r\n")[0]).toBe(
      '"Date","Reference","Category","Title","Amount","Payment","Status"',
    );
    expect(csv).toContain('"Chemicals","Cleaning supplies",30.00,"UPI","CANCELLED"');
    expect(csv).not.toContain("3000");
    expect(csv).not.toContain("minor");

    const injected = await app.request(
      "/api/v1/expenses",
      {
        body: JSON.stringify({
          amountMinor: 1500,
          categoryId: "category-report",
          description: "Formula injection attempt",
          expenseDate: "2026-07-23",
          idempotencyKey: "expense-key-0000002",
          paymentMethod: "CASH",
          title: '=1+1"',
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(injected.status).toBe(201);
    const injectedCsv = await (
      await app.request(
        "/api/v1/reports/export",
        {
          body: JSON.stringify({
            format: "CSV",
            from: "2026-07-23",
            report: "expenses",
            to: "2026-07-23",
          }),
          headers: mutationHeaders,
          method: "POST",
        },
        env,
      )
    ).text();
    expect(injectedCsv).toContain('"=1+1"""');
    expect(injectedCsv).not.toContain("=1+1,");
    expect(injectedCsv).toContain("15.00");

    const pdf = await app.request(
      "/api/v1/reports/export",
      {
        body: JSON.stringify({
          format: "PDF",
          from: "2026-07-23",
          report: "expenses",
          to: "2026-07-23",
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(
      new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5)),
    ).toBe("%PDF-");

    const profitExport = await app.request(
      "/api/v1/reports/export",
      {
        body: JSON.stringify({
          format: "CSV",
          from: "2026-07-23",
          report: "profit",
          to: "2026-07-23",
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(profitExport.status).toBe(200);
    const profitCsv = await profitExport.text();
    expect(profitCsv.split("\r\n")[0]).toBe(
      '"Expenses","From","Net profit","Revenue","To"',
    );
    expect(profitCsv).toContain("15.00,2026-07-23,-15.00,0.00,2026-07-23");

    const category = await app.request(
      "/api/v1/expense-categories",
      {
        body: JSON.stringify({
          code: "utilities",
          displayOrder: 3,
          name: "Utilities",
        }),
        headers: mutationHeaders,
        method: "POST",
      },
      env,
    );
    expect(category.status).toBe(201);
    const categoryId = (await category.json<{ data: { id: string } }>()).data
      .id;
    const categoryUpdate = await app.request(
      `/api/v1/expense-categories/${categoryId}`,
      {
        body: JSON.stringify({ isActive: false, name: "Site utilities" }),
        headers: mutationHeaders,
        method: "PATCH",
      },
      env,
    );
    expect(categoryUpdate.status).toBe(200);
    expect(await categoryUpdate.json()).toMatchObject({
      data: { is_active: 0, name: "Site utilities" },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = 'org-report' AND record_type = 'EXPENSE_CATEGORY'",
      ).first<number>("count"),
    ).toBe(2);
  });
});
