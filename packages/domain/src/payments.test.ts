import { describe, expect, it } from "vitest";

import { derivePaymentSummary } from "./payments";

describe("payment status", () => {
  it("derives pending, partial, paid, and refunded states from append-only records", () => {
    expect(derivePaymentSummary(100_000, [], [])).toMatchObject({
      status: "PENDING",
      balanceMinor: 100_000,
    });
    expect(derivePaymentSummary(100_000, [40_000], [])).toMatchObject({
      status: "PARTIALLY_PAID",
      balanceMinor: 60_000,
    });
    expect(derivePaymentSummary(100_000, [40_000, 60_000], [])).toMatchObject({
      status: "PAID",
      balanceMinor: 0,
    });
    expect(derivePaymentSummary(100_000, [100_000], [100_000])).toMatchObject({
      status: "REFUNDED",
      balanceMinor: 100_000,
    });
  });

  it("rejects overpayment and over-refund", () => {
    expect(() => derivePaymentSummary(100_000, [100_001], [])).toThrow(
      "exceeds",
    );
    expect(() => derivePaymentSummary(100_000, [50_000], [50_001])).toThrow(
      "exceeds",
    );
  });
});
