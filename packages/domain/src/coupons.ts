import type { DiscountType, ErrorCode } from "@washpro/contracts";

export interface CouponDefinition {
  readonly active: boolean;
  readonly code: string;
  readonly discountType: DiscountType;
  readonly discountValue: number;
  readonly minimumBillMinor: number;
  readonly maximumDiscountMinor: number | null;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly totalUsageLimit: number | null;
  readonly perCustomerLimit: number | null;
  readonly eligibleServiceIds: readonly string[];
  readonly eligibleVehicleTypeIds: readonly string[];
  readonly newCustomersOnly: boolean;
}

export interface CouponContext {
  readonly now: string;
  readonly subtotalMinor: number;
  readonly customerUsageCount: number;
  readonly totalUsageCount: number;
  readonly customerCompletedVisits: number;
  readonly serviceIds: readonly string[];
  readonly vehicleTypeId: string;
}

export type CouponValidation =
  | { readonly valid: true; readonly discountMinor: number }
  | { readonly valid: false; readonly reason: ErrorCode };

function intersects(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === 0 || right.some((value) => left.includes(value));
}

export function validateCoupon(
  coupon: CouponDefinition,
  context: CouponContext,
): CouponValidation {
  if (!coupon.active) return { valid: false, reason: "COUPON_DISABLED" };
  const now = Date.parse(context.now);
  if (now < Date.parse(coupon.startsAt))
    return { valid: false, reason: "COUPON_INVALID" };
  if (now > Date.parse(coupon.expiresAt))
    return { valid: false, reason: "COUPON_EXPIRED" };
  if (
    (coupon.totalUsageLimit !== null &&
      context.totalUsageCount >= coupon.totalUsageLimit) ||
    (coupon.perCustomerLimit !== null &&
      context.customerUsageCount >= coupon.perCustomerLimit)
  ) {
    return { valid: false, reason: "COUPON_LIMIT_REACHED" };
  }
  if (
    context.subtotalMinor < coupon.minimumBillMinor ||
    (coupon.newCustomersOnly && context.customerCompletedVisits > 0) ||
    !intersects(coupon.eligibleServiceIds, context.serviceIds) ||
    (coupon.eligibleVehicleTypeIds.length > 0 &&
      !coupon.eligibleVehicleTypeIds.includes(context.vehicleTypeId))
  ) {
    return { valid: false, reason: "COUPON_NOT_ELIGIBLE" };
  }

  const calculated =
    coupon.discountType === "FIXED"
      ? coupon.discountValue
      : Math.floor(
          (context.subtotalMinor * coupon.discountValue + 5_000) / 10_000,
        );
  const maximum = coupon.maximumDiscountMinor ?? calculated;
  return {
    valid: true,
    discountMinor: Math.min(calculated, maximum, context.subtotalMinor),
  };
}
