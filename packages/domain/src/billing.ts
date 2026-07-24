export type RoundingMode = "NONE" | "NEAREST_RUPEE";

export interface BillItemInput {
  readonly unitPriceMinor: number;
  readonly quantity: number;
}

export interface BillInput {
  readonly items: readonly BillItemInput[];
  readonly couponDiscountMinor?: number;
  readonly referralDiscountMinor?: number;
  readonly rewardDiscountMinor?: number;
  readonly manualDiscountMinor?: number;
  readonly taxRateBasisPoints: number;
  readonly roundingMode: RoundingMode;
}

export interface BillResult {
  readonly subtotalMinor: number;
  readonly couponDiscountMinor: number;
  readonly referralDiscountMinor: number;
  readonly rewardDiscountMinor: number;
  readonly manualDiscountMinor: number;
  readonly totalDiscountMinor: number;
  readonly taxableAmountMinor: number;
  readonly taxMinor: number;
  readonly roundingMinor: number;
  readonly totalAmountMinor: number;
}

function assertMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${label} must be a non-negative integer minor-unit amount.`,
    );
  }
}

function cappedDiscount(
  requested: number | undefined,
  remaining: number,
): number {
  const amount = requested ?? 0;
  assertMinorUnits(amount, "Discount");
  return Math.min(amount, remaining);
}

export function calculateBill(input: BillInput): BillResult {
  if (
    !Number.isInteger(input.taxRateBasisPoints) ||
    input.taxRateBasisPoints < 0 ||
    input.taxRateBasisPoints > 10_000
  ) {
    throw new Error("Tax rate must be between 0 and 10000 basis points.");
  }

  const subtotalMinor = input.items.reduce((total, item) => {
    assertMinorUnits(item.unitPriceMinor, "Unit price");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantity must be a positive integer.");
    }
    return total + item.unitPriceMinor * item.quantity;
  }, 0);

  let remaining = subtotalMinor;
  const couponDiscountMinor = cappedDiscount(
    input.couponDiscountMinor,
    remaining,
  );
  remaining -= couponDiscountMinor;
  const referralDiscountMinor = cappedDiscount(
    input.referralDiscountMinor,
    remaining,
  );
  remaining -= referralDiscountMinor;
  const rewardDiscountMinor = cappedDiscount(
    input.rewardDiscountMinor,
    remaining,
  );
  remaining -= rewardDiscountMinor;
  const manualDiscountMinor = cappedDiscount(
    input.manualDiscountMinor,
    remaining,
  );
  remaining -= manualDiscountMinor;

  const totalDiscountMinor = subtotalMinor - remaining;
  const taxableAmountMinor = remaining;
  const taxMinor = Math.floor(
    (taxableAmountMinor * input.taxRateBasisPoints + 5_000) / 10_000,
  );
  const beforeRounding = taxableAmountMinor + taxMinor;
  const rounded =
    input.roundingMode === "NEAREST_RUPEE"
      ? Math.round(beforeRounding / 100) * 100
      : beforeRounding;
  const totalAmountMinor = Math.max(0, rounded);

  return {
    subtotalMinor,
    couponDiscountMinor,
    referralDiscountMinor,
    rewardDiscountMinor,
    manualDiscountMinor,
    totalDiscountMinor,
    taxableAmountMinor,
    taxMinor,
    roundingMinor: totalAmountMinor - beforeRounding,
    totalAmountMinor,
  };
}
