import { describe, expect, it } from "vitest";

import { calculateFinancialSummary } from "./reports";

describe("financial reporting", () => {
  it("uses successful payments minus refunds and active expenses", () => {
    expect(
      calculateFinancialSummary({
        payments: [
          { amountMinor: 100_000, status: "SUCCESS" },
          { amountMinor: 40_000, status: "FAILED" },
        ],
        refunds: [
          { amountMinor: 10_000, status: "SUCCESS" },
          { amountMinor: 5_000, status: "FAILED" },
        ],
        expenses: [
          { amountMinor: 20_000, status: "ACTIVE" },
          { amountMinor: 9_000, status: "CANCELLED" },
        ],
      }),
    ).toEqual({
      revenueMinor: 90_000,
      expensesMinor: 20_000,
      netProfitMinor: 70_000,
    });
  });
});
