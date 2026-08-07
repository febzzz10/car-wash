import type { PaymentMethod } from "@washpro/contracts";
import { PAYMENT_METHOD_LABELS } from "@washpro/contracts";

import bankUpiImage from "../assets/payment methods/Bankupi.png";
import cashImage from "../assets/payment methods/cash.png";
import paytmImage from "../assets/payment methods/paytm.png";
import upiImage from "../assets/payment methods/upi.png";
import { titleCase } from "./format";

export interface PaymentMethodOption {
  readonly image: string;
  readonly label: string;
  readonly value: PaymentMethod;
}

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  { image: cashImage, label: "Cash", value: "CASH" },
  { image: upiImage, label: "UPI", value: "UPI" },
  { image: paytmImage, label: "Paytm", value: "PAYTM" },
  { image: bankUpiImage, label: "Bank UPI", value: "BANK_UPI" },
] as const;

export function isCanonicalPaymentMethod(
  value: string | undefined | null,
): value is PaymentMethod {
  return (
    typeof value === "string" &&
    PAYMENT_METHOD_OPTIONS.some((option) => option.value === value)
  );
}

export function paymentMethodLabel(method: string): string {
  return (
    PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ??
    titleCase(method)
  );
}
