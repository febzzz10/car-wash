interface FinancialTransaction {
  readonly amountMinor: number;
  readonly status: "SUCCESS" | "FAILED" | "PENDING" | "CANCELLED";
}

interface ExpenseTransaction {
  readonly amountMinor: number;
  readonly status: "ACTIVE" | "CANCELLED";
}

export interface FinancialSummaryInput {
  readonly payments: readonly FinancialTransaction[];
  readonly refunds: readonly FinancialTransaction[];
  readonly expenses: readonly ExpenseTransaction[];
}

export interface FinancialSummary {
  readonly revenueMinor: number;
  readonly expensesMinor: number;
  readonly netProfitMinor: number;
}

function sumValid<T extends { readonly amountMinor: number }>(
  records: readonly T[],
  predicate: (record: T) => boolean,
): number {
  return records.reduce((total, record) => {
    if (!Number.isSafeInteger(record.amountMinor) || record.amountMinor < 0) {
      throw new Error("Financial amount must be a non-negative integer.");
    }
    return predicate(record) ? total + record.amountMinor : total;
  }, 0);
}

export function calculateFinancialSummary(
  input: FinancialSummaryInput,
): FinancialSummary {
  const received = sumValid(
    input.payments,
    (payment) => payment.status === "SUCCESS",
  );
  const refunded = sumValid(
    input.refunds,
    (refund) => refund.status === "SUCCESS",
  );
  const expensesMinor = sumValid(
    input.expenses,
    (expense) => expense.status === "ACTIVE",
  );
  const revenueMinor = received - refunded;
  return {
    revenueMinor,
    expensesMinor,
    netProfitMinor: revenueMinor - expensesMinor,
  };
}

// ── Report column metadata ──

export type ReportColumnType =
  | "currencyMinor"
  | "number"
  | "count"
  | "date"
  | "datetime"
  | "text"
  | "percentage";

export const REPORT_KEYS = [
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
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  readonly type: ReportColumnType;
}

export const REPORT_COLUMNS: Record<ReportKey, readonly ReportColumn[]> = {
  profit: [
    { key: "expensesMinor", label: "Expenses", type: "currencyMinor" },
    { key: "from", label: "From", type: "date" },
    { key: "netProfitMinor", label: "Net profit", type: "currencyMinor" },
    { key: "revenueMinor", label: "Revenue", type: "currencyMinor" },
    { key: "to", label: "To", type: "date" },
  ],
  revenue: [
    { key: "financial_date", label: "Date", type: "date" },
    { key: "revenue_minor", label: "Revenue", type: "currencyMinor" },
  ],
  expenses: [
    { key: "expense_date", label: "Date", type: "date" },
    { key: "expense_reference", label: "Reference", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "title", label: "Title", type: "text" },
    { key: "amount_minor", label: "Amount", type: "currencyMinor" },
    { key: "payment_method", label: "Payment", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  services: [
    { key: "service", label: "Service", type: "text" },
    { key: "item_kind", label: "Kind", type: "text" },
    { key: "selection_count", label: "Count", type: "count" },
    { key: "value_minor", label: "Value", type: "currencyMinor" },
  ],
  vehicles: [
    { key: "vehicle_type", label: "Vehicle type", type: "text" },
    { key: "wash_count", label: "Wash count", type: "count" },
    { key: "value_minor", label: "Value", type: "currencyMinor" },
  ],
  customers: [
    { key: "full_name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "completed_visits", label: "Visits", type: "count" },
    { key: "wash_value_minor", label: "Wash value", type: "currencyMinor" },
  ],
  coupons: [
    { key: "code", label: "Code", type: "text" },
    { key: "reservations", label: "Reservations", type: "count" },
    { key: "redeemed_discount_minor", label: "Discount", type: "currencyMinor" },
  ],
  referrals: [
    { key: "code", label: "Code", type: "text" },
    { key: "referrer", label: "Referrer", type: "text" },
    { key: "referral_count", label: "Referrals", type: "count" },
    {
      key: "friend_discount_minor",
      label: "Friend discount",
      type: "currencyMinor",
    },
    { key: "reward_minor", label: "Reward", type: "currencyMinor" },
  ],
  staff: [
    { key: "staff", label: "Staff", type: "text" },
    { key: "completed_jobs", label: "Jobs", type: "count" },
    { key: "active_seconds", label: "Active time", type: "number" },
    {
      key: "average_duration_seconds",
      label: "Avg duration",
      type: "number",
    },
  ],
  payments: [
    { key: "job_reference", label: "Job", type: "text" },
    { key: "customer_name_snapshot", label: "Customer", type: "text" },
    { key: "total_amount_minor", label: "Total", type: "currencyMinor" },
    { key: "paid_amount_minor", label: "Paid", type: "currencyMinor" },
    { key: "refunded_amount_minor", label: "Refunded", type: "currencyMinor" },
    { key: "balance_minor", label: "Balance", type: "currencyMinor" },
    { key: "payment_status", label: "Status", type: "text" },
  ],
  jobs: [
    { key: "status", label: "Status", type: "text" },
    { key: "job_count", label: "Jobs", type: "count" },
    {
      key: "average_duration_seconds",
      label: "Avg duration",
      type: "number",
    },
    { key: "billed_minor", label: "Billed", type: "currencyMinor" },
  ],
};

// ── Report formatting helpers ──

/**
 * Converts a minor-unit monetary value to a deterministic two-decimal
 * major-unit string for machine-readable exports (CSV). No currency symbol
 * and no thousands separators are added.
 *
 * Throws when the value is not a finite number, so malformed data is never
 * silently exported as zero.
 */
export function formatMinorForCsv(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Report export contains an invalid monetary value.");
  }
  return (value / 100).toFixed(2);
}

/**
 * Converts a minor-unit monetary value to a display string using an
 * ASCII-safe currency-code prefix (e.g. "INR 6,950.00") for environments
 * whose fonts cannot render the currency symbol (PDF exports).
 *
 * Returns "—" for invalid values. Never produces NaN/Infinity output.
 */
export function formatMinorForDisplay(value: unknown, currency: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const code = currency.trim().toUpperCase() || "INR";
  const sign = value < 0 ? "-" : "";
  const major = Math.abs(value) / 100;
  const [whole, fraction] = major.toFixed(2).split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${code} ${grouped}.${fraction}`;
}

/**
 * Converts a raw report property name (camelCase or snake_case) into a
 * readable sentence-case label. Used as a fallback for columns without
 * explicit metadata.
 */
export function formatReportLabel(key: string): string {
  if (key === "from" || key === "to") return key === "from" ? "From" : "To";
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_]/g, " ")
    .replace(/\s*[Mm]inor$/u, "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const label = words.join(" ").toLocaleLowerCase("en");
  return label.length === 0
    ? key
    : label[0]!.toLocaleUpperCase("en") + label.slice(1);
}
