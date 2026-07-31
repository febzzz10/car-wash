import { describe, expect, it } from "vitest";

import {
  calculateFinancialSummary,
  formatMinorForCsv,
  formatMinorForDisplay,
  formatReportLabel,
  REPORT_COLUMNS,
  REPORT_KEYS,
} from "./reports";

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

describe("report column metadata", () => {
  it("covers every supported report type", () => {
    expect(Object.keys(REPORT_COLUMNS).sort()).toEqual([...REPORT_KEYS].sort());
  });

  it("marks every monetary field as currencyMinor", () => {
    const monetary = Object.values(REPORT_COLUMNS)
      .flat()
      .filter((column) => column.key.toLocaleLowerCase().includes("minor"));
    expect(monetary).toHaveLength(16);
    for (const column of monetary) {
      expect(column.type).toBe("currencyMinor");
    }
  });
});

describe("formatMinorForCsv", () => {
  it("converts minor units to two-decimal major units", () => {
    expect(formatMinorForCsv(695_000)).toBe("6950.00");
    expect(formatMinorForCsv(0)).toBe("0.00");
    expect(formatMinorForCsv(1)).toBe("0.01");
    expect(formatMinorForCsv(-40_000)).toBe("-400.00");
  });

  it("rejects non-numeric or non-finite values", () => {
    for (const value of [undefined, null, "695000", NaN, Infinity]) {
      expect(() => formatMinorForCsv(value)).toThrow(
        "Report export contains an invalid monetary value.",
      );
    }
  });
});

describe("formatMinorForDisplay", () => {
  it("uses an ASCII currency-code prefix with grouping", () => {
    expect(formatMinorForDisplay(695_000, "INR")).toBe("INR 6,950.00");
    expect(formatMinorForDisplay(40_000, "USD")).toBe("USD 400.00");
    expect(formatMinorForDisplay(-40_000, "INR")).toBe("-INR 400.00");
    expect(formatMinorForDisplay(0, "INR")).toBe("INR 0.00");
    expect(formatMinorForDisplay(1, "INR")).toBe("INR 0.01");
  });

  it("defaults a blank currency code to INR", () => {
    expect(formatMinorForDisplay(100, "  ")).toBe("INR 1.00");
  });

  it("returns an em dash for invalid values", () => {
    expect(formatMinorForDisplay(undefined, "INR")).toBe("—");
    expect(formatMinorForDisplay(null, "INR")).toBe("—");
    expect(formatMinorForDisplay(NaN, "INR")).toBe("—");
    expect(formatMinorForDisplay(Infinity, "INR")).toBe("—");
    expect(formatMinorForDisplay("695000", "INR")).toBe("—");
  });
});

describe("formatReportLabel", () => {
  it("reads snake_case and camelCase keys", () => {
    expect(formatReportLabel("redeemed_discount_minor")).toBe("Redeemed discount");
    expect(formatReportLabel("expense_reference")).toBe("Expense reference");
    expect(formatReportLabel("netProfitMinor")).toBe("Net profit");
    expect(formatReportLabel("average_duration_seconds")).toBe(
      "Average duration seconds",
    );
  });

  it("keeps from/to readable", () => {
    expect(formatReportLabel("from")).toBe("From");
    expect(formatReportLabel("to")).toBe("To");
  });
});
