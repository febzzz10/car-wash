import { normalizePhone } from "@washpro/domain";

import { formatMinorAmount } from "./gmail";

export interface WhatsAppMessageInput {
  readonly currencyCode: string;
  readonly customerName: string;
  readonly paymentStatus: string;
  readonly referralCode: string | null;
  readonly serviceName: string;
  readonly totalMinor: number;
  readonly vehicleRegistration: string;
}

export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const serviceName = input.serviceName || "Car wash";
  const amount = formatMinorAmount(input.totalMinor, input.currencyCode);
  const payment =
    input.paymentStatus === "PAID" ? "PAID ✅" : input.paymentStatus;
  const lines = [
    `Hi ${input.customerName} 👋`,
    "Thank you for choosing WashPro! 🚗✨",
    "",
    `Your ${serviceName} for vehicle ${input.vehicleRegistration} is complete.`,
    `Amount: ${amount}`,
    `Payment: ${payment}`,
  ];
  if (input.referralCode !== null && input.referralCode.trim() !== "") {
    lines.push(`Referral code: ${input.referralCode.trim()}`);
  }
  lines.push("", "Thanks for visiting WashPro. See you again! 😊");
  return lines.join("\n");
}

export function buildWhatsAppUrl(
  phone: string,
  message: string,
): string | null {
  try {
    const normalized = normalizePhone(phone);
    return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`;
  } catch {
    return null;
  }
}
