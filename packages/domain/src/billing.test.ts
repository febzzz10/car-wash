import { describe, expect, it } from "vitest";

import { calculateBill } from "./billing";

describe("billing engine", () => {
  it("applies every adjustment in the PRD order before tax and rounding", () => {
    expect(
      calculateBill({
        items: [
          { unitPriceMinor: 80_000, quantity: 1 },
          { unitPriceMinor: 25_000, quantity: 1 },
        ],
        couponDiscountMinor: 10_000,
        referralDiscountMinor: 5_000,
        rewardDiscountMinor: 2_500,
        manualDiscountMinor: 2_500,
        taxRateBasisPoints: 1_800,
        roundingMode: "NEAREST_RUPEE",
      }),
    ).toEqual({
      subtotalMinor: 105_000,
      couponDiscountMinor: 10_000,
      referralDiscountMinor: 5_000,
      rewardDiscountMinor: 2_500,
      manualDiscountMinor: 2_500,
      totalDiscountMinor: 20_000,
      taxableAmountMinor: 85_000,
      taxMinor: 15_300,
      roundingMinor: 0,
      totalAmountMinor: 100_300,
    });
  });

  it("caps sequential discounts and never returns a negative total", () => {
    const result = calculateBill({
      items: [{ unitPriceMinor: 10_000, quantity: 1 }],
      couponDiscountMinor: 8_000,
      referralDiscountMinor: 8_000,
      rewardDiscountMinor: 8_000,
      manualDiscountMinor: 8_000,
      taxRateBasisPoints: 1_800,
      roundingMode: "NONE",
    });

    expect(result.totalDiscountMinor).toBe(10_000);
    expect(result.totalAmountMinor).toBe(0);
    expect(result.referralDiscountMinor).toBe(2_000);
    expect(result.rewardDiscountMinor).toBe(0);
  });

  it("rounds the payable amount to the nearest rupee", () => {
    const result = calculateBill({
      items: [{ unitPriceMinor: 9_999, quantity: 1 }],
      taxRateBasisPoints: 0,
      roundingMode: "NEAREST_RUPEE",
    });

    expect(result.roundingMinor).toBe(1);
    expect(result.totalAmountMinor).toBe(10_000);
  });
});
