import { describe, expect, it } from "vitest";

import { validateCoupon } from "./coupons";

const baseCoupon = {
  active: true,
  code: "WASH20",
  discountType: "PERCENTAGE" as const,
  discountValue: 2_000,
  minimumBillMinor: 50_000,
  maximumDiscountMinor: 25_000,
  startsAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2026-08-01T00:00:00.000Z",
  totalUsageLimit: 100,
  perCustomerLimit: 1,
  eligibleServiceIds: ["service-deluxe"],
  eligibleVehicleTypeIds: ["vehicle-suv"],
  newCustomersOnly: true,
};

const baseContext = {
  now: "2026-07-23T10:00:00.000Z",
  subtotalMinor: 100_000,
  customerUsageCount: 0,
  totalUsageCount: 0,
  customerCompletedVisits: 0,
  serviceIds: ["service-deluxe"],
  vehicleTypeId: "vehicle-suv",
};

describe("coupon validation", () => {
  it("calculates and caps an eligible percentage coupon", () => {
    expect(validateCoupon(baseCoupon, baseContext)).toEqual({
      valid: true,
      discountMinor: 20_000,
    });
  });

  it.each([
    ["disabled", { active: false }, {}, "COUPON_DISABLED"],
    ["expired", {}, { now: "2026-08-02T00:00:00.000Z" }, "COUPON_EXPIRED"],
    ["minimum bill", {}, { subtotalMinor: 49_999 }, "COUPON_NOT_ELIGIBLE"],
    ["total limit", {}, { totalUsageCount: 100 }, "COUPON_LIMIT_REACHED"],
    ["customer limit", {}, { customerUsageCount: 1 }, "COUPON_LIMIT_REACHED"],
    [
      "existing customer",
      {},
      { customerCompletedVisits: 1 },
      "COUPON_NOT_ELIGIBLE",
    ],
    ["service", {}, { serviceIds: ["other"] }, "COUPON_NOT_ELIGIBLE"],
    ["vehicle", {}, { vehicleTypeId: "other" }, "COUPON_NOT_ELIGIBLE"],
  ])("rejects %s ineligibility", (_name, couponPatch, contextPatch, reason) => {
    expect(
      validateCoupon(
        { ...baseCoupon, ...couponPatch },
        { ...baseContext, ...contextPatch },
      ),
    ).toEqual({ valid: false, reason });
  });
});
