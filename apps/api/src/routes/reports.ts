import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import { auditStatement } from "../services/audit";
import { buildReportPdf } from "../services/report-pdf";
import type { AppBindings } from "../types";

const dateSchema = z.iso.date();
const exportSchema = z.object({
  format: z.enum(["CSV", "PDF"]),
  from: dateSchema,
  report: z.enum([
    "revenue",
    "expenses",
    "profit",
    "services",
    "vehicles",
    "customers",
    "coupons",
    "referrals",
    "staff",
    "payments",
    "jobs",
  ]),
  to: dateSchema,
});

function range(c: { req: { query(name: string): string | undefined } }): {
  readonly from: string;
  readonly to: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? today;
  const to = c.req.query("to") ?? today;
  if (
    !dateSchema.safeParse(from).success ||
    !dateSchema.safeParse(to).success ||
    from > to
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Enter a valid report date range.",
    );
  }
  return { from, to };
}

async function financialSummary(
  env: Env,
  organizationId: string,
  branchId: string | null,
  from: string,
  to: string,
) {
  return env.DB.prepare(
    `SELECT
      COALESCE((SELECT SUM(amount_minor) FROM payments WHERE organization_id = ? AND branch_id = ? AND status = 'SUCCESS' AND substr(paid_at, 1, 10) BETWEEN ? AND ?), 0)
      - COALESCE((SELECT SUM(amount_minor) FROM refunds WHERE organization_id = ? AND branch_id = ? AND status = 'SUCCESS' AND substr(processed_at, 1, 10) BETWEEN ? AND ?), 0) AS revenue_minor,
      COALESCE((SELECT SUM(amount_minor) FROM expenses WHERE organization_id = ? AND branch_id = ? AND status = 'ACTIVE' AND expense_date BETWEEN ? AND ?), 0) AS expenses_minor`,
  )
    .bind(
      organizationId,
      branchId,
      from,
      to,
      organizationId,
      branchId,
      from,
      to,
      organizationId,
      branchId,
      from,
      to,
    )
    .first<{ expenses_minor: number; revenue_minor: number }>();
}

async function reportRows(
  env: Env,
  organizationId: string,
  branchId: string | null,
  report: z.infer<typeof exportSchema>["report"],
  from: string,
  to: string,
): Promise<readonly Record<string, unknown>[]> {
  const queryByReport: Record<typeof report, string> = {
    coupons: `SELECT c.code, COUNT(cr.id) AS reservations, COALESCE(SUM(CASE WHEN cr.status = 'REDEEMED' THEN cr.discount_amount_minor ELSE 0 END), 0) AS redeemed_discount_minor FROM coupons c LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id AND substr(COALESCE(cr.redeemed_at, cr.reserved_at), 1, 10) BETWEEN ? AND ? WHERE c.organization_id = ? GROUP BY c.id ORDER BY reservations DESC`,
    customers: `SELECT c.full_name, c.phone, COUNT(w.id) AS completed_visits, COALESCE(SUM(w.total_amount_minor), 0) AS wash_value_minor FROM customers c LEFT JOIN wash_jobs w ON w.customer_id = c.id AND w.status = 'COMPLETED' AND substr(w.completed_at, 1, 10) BETWEEN ? AND ? WHERE c.organization_id = ? GROUP BY c.id ORDER BY completed_visits DESC`,
    expenses: `SELECT e.expense_date, e.expense_reference, ec.name AS category, e.title, e.amount_minor, e.payment_method, e.status FROM expenses e INNER JOIN expense_categories ec ON ec.id = e.category_id WHERE e.branch_id = ? AND e.organization_id = ? AND e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date`,
    payments: `SELECT w.job_reference, w.customer_name_snapshot, w.total_amount_minor, w.paid_amount_minor, w.refunded_amount_minor, w.balance_minor, w.payment_status FROM wash_jobs w WHERE w.branch_id = ? AND w.organization_id = ? AND w.status = 'COMPLETED' AND substr(w.completed_at, 1, 10) BETWEEN ? AND ? ORDER BY w.completed_at`,
    jobs: `SELECT status, COUNT(*) AS job_count, COALESCE(AVG(CASE WHEN status = 'COMPLETED' THEN total_active_seconds END), 0) AS average_duration_seconds, COALESCE(SUM(total_amount_minor), 0) AS billed_minor FROM wash_jobs WHERE branch_id = ? AND organization_id = ? AND substr(COALESCE(completed_at, cancelled_at, created_at), 1, 10) BETWEEN ? AND ? GROUP BY status ORDER BY status`,
    profit: `SELECT * FROM v_daily_financials WHERE branch_id = ? AND financial_date BETWEEN ? AND ? ORDER BY financial_date`,
    referrals: `SELECT rc.code, c.full_name AS referrer, COUNT(rr.id) AS referral_count, COALESCE(SUM(rr.friend_discount_minor), 0) AS friend_discount_minor, COALESCE(SUM(rr.reward_amount_minor), 0) AS reward_minor FROM referral_codes rc INNER JOIN customers c ON c.id = rc.customer_id LEFT JOIN referral_redemptions rr ON rr.referral_code_id = rc.id AND substr(rr.created_at, 1, 10) BETWEEN ? AND ? WHERE rc.organization_id = ? GROUP BY rc.id ORDER BY referral_count DESC`,
    revenue: `SELECT financial_date, revenue_minor FROM v_daily_financials WHERE branch_id = ? AND financial_date BETWEEN ? AND ? ORDER BY financial_date`,
    services: `SELECT wji.service_name_snapshot AS service, wji.item_kind, COUNT(*) AS selection_count, COALESCE(SUM(wji.line_total_minor), 0) AS value_minor FROM wash_job_items wji INNER JOIN wash_jobs w ON w.id = wji.wash_job_id WHERE w.branch_id = ? AND w.organization_id = ? AND w.status = 'COMPLETED' AND substr(w.completed_at, 1, 10) BETWEEN ? AND ? GROUP BY wji.service_name_snapshot, wji.item_kind ORDER BY selection_count DESC`,
    staff: `SELECT u.full_name AS staff, COUNT(w.id) AS completed_jobs, COALESCE(SUM(w.total_active_seconds), 0) AS active_seconds, COALESCE(AVG(w.total_active_seconds), 0) AS average_duration_seconds FROM users u LEFT JOIN wash_jobs w ON w.assigned_user_id = u.id AND w.status = 'COMPLETED' AND substr(w.completed_at, 1, 10) BETWEEN ? AND ? WHERE u.organization_id = ? GROUP BY u.id ORDER BY completed_jobs DESC`,
    vehicles: `SELECT vt.name AS vehicle_type, COUNT(w.id) AS wash_count, COALESCE(SUM(w.total_amount_minor), 0) AS value_minor FROM vehicle_types vt LEFT JOIN vehicles v ON v.vehicle_type_id = vt.id LEFT JOIN wash_jobs w ON w.vehicle_id = v.id AND w.status = 'COMPLETED' AND substr(w.completed_at, 1, 10) BETWEEN ? AND ? WHERE vt.organization_id = ? GROUP BY vt.id ORDER BY wash_count DESC`,
  };
  const sql = queryByReport[report];
  const branchFirst = new Set([
    "expenses",
    "payments",
    "profit",
    "revenue",
    "services",
    "jobs",
  ]);
  const statement = branchFirst.has(report)
    ? report === "profit" || report === "revenue"
      ? env.DB.prepare(sql).bind(branchId, from, to)
      : env.DB.prepare(sql).bind(branchId, organizationId, from, to)
    : env.DB.prepare(sql).bind(from, to, organizationId);
  return (await statement.all<Record<string, unknown>>()).results;
}

function csv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "No data\r\n";
  const columns = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    columns.map(escape).join(","),
    ...rows.map((row) =>
      columns.map((column) => escape(row[column])).join(","),
    ),
  ].join("\r\n");
}

export const dashboardRoutes = new Hono<AppBindings>();
dashboardRoutes.use("*", requireAdmin);

dashboardRoutes.get(
  "/summary",
  requirePermission("reports.profit"),
  async (c) => {
    const auth = c.get("auth");
    const { from, to } = range(c);
    const financial = await financialSummary(
      c.env,
      auth.organizationId,
      auth.branchId,
      from,
      to,
    );
    const operations = await c.env.DB.prepare(
      `SELECT
      SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) AS waiting_jobs,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_jobs,
      SUM(CASE WHEN status = 'PAUSED' THEN 1 ELSE 0 END) AS paused_jobs,
      SUM(CASE WHEN status = 'COMPLETED' AND substr(completed_at, 1, 10) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS completed_jobs,
      SUM(CASE WHEN status = 'CANCELLED' AND substr(cancelled_at, 1, 10) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS cancelled_jobs,
      COALESCE(SUM(CASE WHEN status <> 'CANCELLED' AND balance_minor > 0 THEN balance_minor ELSE 0 END), 0) AS pending_payments_minor,
      COALESCE(AVG(CASE WHEN status = 'COMPLETED' AND substr(completed_at, 1, 10) BETWEEN ? AND ? THEN total_active_seconds END), 0) AS average_wash_duration_seconds
     FROM wash_jobs WHERE organization_id = ? AND branch_id = ?`,
    )
      .bind(from, to, from, to, from, to, auth.organizationId, auth.branchId)
      .first<Record<string, number>>();
    const rewards =
      (await c.env.DB.prepare(
        "SELECT COALESCE(SUM(remaining_amount_minor), 0) AS total FROM referral_rewards WHERE organization_id = ? AND status IN ('AVAILABLE', 'RESERVED')",
      )
        .bind(auth.organizationId)
        .first<number>("total")) ?? 0;
    const revenue = financial?.revenue_minor ?? 0;
    const expenses = financial?.expenses_minor ?? 0;
    return c.json({
      data: {
        averageWashDurationSeconds:
          operations?.average_wash_duration_seconds ?? 0,
        cancelledJobs: operations?.cancelled_jobs ?? 0,
        carsWashed: operations?.completed_jobs ?? 0,
        completedJobs: operations?.completed_jobs ?? 0,
        expensesMinor: expenses,
        inProgressJobs: operations?.in_progress_jobs ?? 0,
        netProfitMinor: revenue - expenses,
        pausedJobs: operations?.paused_jobs ?? 0,
        pendingPaymentsMinor: operations?.pending_payments_minor ?? 0,
        referralRewardsMinor: rewards,
        revenueMinor: revenue,
        waitingJobs: operations?.waiting_jobs ?? 0,
      },
      success: true,
    });
  },
);

dashboardRoutes.get("/activity", async (c) => {
  const auth = c.get("auth");
  const result = await c.env.DB.prepare(
    "SELECT action, record_type, record_id, severity, created_at FROM audit_logs WHERE organization_id = ? AND (branch_id IS NULL OR branch_id = ?) ORDER BY created_at DESC LIMIT 30",
  )
    .bind(auth.organizationId, auth.branchId)
    .all();
  return c.json({ data: result.results, success: true });
});

export const reportRoutes = new Hono<AppBindings>();
reportRoutes.use("*", requireAdmin);

for (const report of [
  "revenue",
  "expenses",
  "profit",
  "services",
  "vehicles",
  "customers",
  "coupons",
  "referrals",
  "staff",
  "payments",
  "jobs",
] as const) {
  reportRoutes.get(
    `/${report}`,
    requirePermission(
      report === "profit" || report === "expenses"
        ? "reports.profit"
        : report === "staff"
          ? "reports.staff"
          : "reports.revenue",
    ),
    async (c) => {
      const auth = c.get("auth");
      const { from, to } = range(c);
      if (report === "profit") {
        const financial = await financialSummary(
          c.env,
          auth.organizationId,
          auth.branchId,
          from,
          to,
        );
        const revenue = financial?.revenue_minor ?? 0;
        const expenses = financial?.expenses_minor ?? 0;
        return c.json({
          data: {
            expensesMinor: expenses,
            from,
            netProfitMinor: revenue - expenses,
            revenueMinor: revenue,
            to,
          },
          success: true,
        });
      }
      return c.json({
        data: await reportRows(
          c.env,
          auth.organizationId,
          auth.branchId,
          report,
          from,
          to,
        ),
        success: true,
      });
    },
  );
}

reportRoutes.post(
  "/export",
  requirePermission("reports.revenue"),
  async (c) => {
    const parsed = exportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Check the report export options.",
      );
    if (parsed.data.from > parsed.data.to)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "The start date must be before the end date.",
      );
    const auth = c.get("auth");
    const rows = await reportRows(
      c.env,
      auth.organizationId,
      auth.branchId,
      parsed.data.report,
      parsed.data.from,
      parsed.data.to,
    );
    await auditStatement(c.env, {
      action: "REPORT_EXPORTED",
      auth,
      next: parsed.data,
      recordType: "REPORT",
      requestId: c.get("requestId"),
      severity: "WARNING",
    }).run();
    if (parsed.data.format === "PDF") {
      const pdf = await buildReportPdf({
        from: parsed.data.from,
        report: parsed.data.report,
        rows,
        to: parsed.data.to,
      });
      c.header(
        "content-disposition",
        `attachment; filename="washpro-${parsed.data.report}-${parsed.data.from}-${parsed.data.to}.pdf"`,
      );
      return c.body(pdf.buffer as ArrayBuffer, 200, {
        "content-type": "application/pdf",
      });
    }
    c.header(
      "content-disposition",
      `attachment; filename="washpro-${parsed.data.report}-${parsed.data.from}-${parsed.data.to}.csv"`,
    );
    return c.body(csv(rows), 200, {
      "content-type": "text/csv; charset=utf-8",
    });
  },
);
