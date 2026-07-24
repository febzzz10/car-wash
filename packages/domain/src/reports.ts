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
