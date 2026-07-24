import type { PaymentStatus } from "@washpro/contracts";

export interface PaymentSummary {
  readonly paidMinor: number;
  readonly refundedMinor: number;
  readonly netPaidMinor: number;
  readonly balanceMinor: number;
  readonly status: PaymentStatus;
}

function sumAmounts(amounts: readonly number[], label: string): number {
  return amounts.reduce((total, amount) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(`${label} amount must be a positive integer.`);
    }
    return total + amount;
  }, 0);
}

export function derivePaymentSummary(
  totalMinor: number,
  successfulPayments: readonly number[],
  successfulRefunds: readonly number[],
): PaymentSummary {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new Error("Job total must be a non-negative integer.");
  }
  const paidMinor = sumAmounts(successfulPayments, "Payment");
  const refundedMinor = sumAmounts(successfulRefunds, "Refund");
  if (paidMinor > totalMinor)
    throw new Error("Payment exceeds the remaining balance.");
  if (refundedMinor > paidMinor)
    throw new Error("Refund exceeds the refundable amount.");
  const netPaidMinor = paidMinor - refundedMinor;
  const balanceMinor = totalMinor - netPaidMinor;
  let status: PaymentStatus = "PENDING";
  if (paidMinor > 0 && refundedMinor === paidMinor) status = "REFUNDED";
  else if (netPaidMinor >= totalMinor && totalMinor > 0) status = "PAID";
  else if (netPaidMinor > 0) status = "PARTIALLY_PAID";
  return { paidMinor, refundedMinor, netPaidMinor, balanceMinor, status };
}
