import type { DiscountType, ErrorCode } from "@washpro/contracts";

export interface ReferralDefinition {
  readonly enabled: boolean;
  readonly status: "ACTIVE" | "DISABLED" | "EXPIRED";
  readonly referrerCustomerId: string;
  readonly expiresAt: string | null;
  readonly friendDiscountType: DiscountType;
  readonly friendDiscountValue: number;
  readonly minimumBillMinor: number;
  readonly maximumDiscountMinor: number | null;
  readonly eligibleServiceIds: readonly string[];
  readonly eligibleVehicleTypeIds: readonly string[];
  readonly newCustomersOnly: boolean;
}

export interface ReferralContext {
  readonly now: string;
  readonly referredCustomerId: string;
  readonly subtotalMinor: number;
  readonly completedVisits: number;
  readonly benefitAlreadyUsed: boolean;
  readonly serviceIds: readonly string[];
  readonly vehicleTypeId: string;
}

export type ReferralValidation =
  | { readonly valid: true; readonly discountMinor: number }
  | { readonly valid: false; readonly reason: ErrorCode };

export function validateReferral(
  referral: ReferralDefinition,
  context: ReferralContext,
): ReferralValidation {
  if (referral.referrerCustomerId === context.referredCustomerId) {
    return { valid: false, reason: "REFERRAL_SELF_USE" };
  }
  if (context.benefitAlreadyUsed) {
    return { valid: false, reason: "REFERRAL_ALREADY_USED" };
  }
  const expired =
    referral.expiresAt !== null &&
    Date.parse(context.now) > Date.parse(referral.expiresAt);
  const serviceEligible =
    referral.eligibleServiceIds.length === 0 ||
    context.serviceIds.some((id) => referral.eligibleServiceIds.includes(id));
  const vehicleEligible =
    referral.eligibleVehicleTypeIds.length === 0 ||
    referral.eligibleVehicleTypeIds.includes(context.vehicleTypeId);
  if (
    !referral.enabled ||
    referral.status !== "ACTIVE" ||
    expired ||
    context.subtotalMinor < referral.minimumBillMinor ||
    (referral.newCustomersOnly && context.completedVisits > 0) ||
    !serviceEligible ||
    !vehicleEligible
  ) {
    return { valid: false, reason: "REFERRAL_INVALID" };
  }

  const calculated =
    referral.friendDiscountType === "FIXED"
      ? referral.friendDiscountValue
      : Math.floor(
          (context.subtotalMinor * referral.friendDiscountValue + 5_000) /
            10_000,
        );
  return {
    valid: true,
    discountMinor: Math.min(
      calculated,
      referral.maximumDiscountMinor ?? calculated,
      context.subtotalMinor,
    ),
  };
}
