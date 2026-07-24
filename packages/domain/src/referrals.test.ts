import { describe, expect, it } from "vitest";

import { validateReferral } from "./referrals";

const referral = {
  enabled: true,
  status: "ACTIVE" as const,
  referrerCustomerId: "customer-a",
  expiresAt: "2026-08-01T00:00:00.000Z",
  friendDiscountType: "FIXED" as const,
  friendDiscountValue: 15_000,
  minimumBillMinor: 50_000,
  maximumDiscountMinor: 15_000,
  eligibleServiceIds: ["service-deluxe"],
  eligibleVehicleTypeIds: ["vehicle-suv"],
  newCustomersOnly: true,
};

const context = {
  now: "2026-07-23T10:00:00.000Z",
  referredCustomerId: "customer-b",
  subtotalMinor: 100_000,
  completedVisits: 0,
  benefitAlreadyUsed: false,
  serviceIds: ["service-deluxe"],
  vehicleTypeId: "vehicle-suv",
};

describe("referral validation", () => {
  it("returns the eligible friend discount", () => {
    expect(validateReferral(referral, context)).toEqual({
      valid: true,
      discountMinor: 15_000,
    });
  });

  it("blocks self-referral and duplicate first-time benefits", () => {
    expect(
      validateReferral(referral, {
        ...context,
        referredCustomerId: "customer-a",
      }),
    ).toEqual({ valid: false, reason: "REFERRAL_SELF_USE" });
    expect(
      validateReferral(referral, { ...context, benefitAlreadyUsed: true }),
    ).toEqual({ valid: false, reason: "REFERRAL_ALREADY_USED" });
  });

  it("rejects expired and ineligible referrals", () => {
    expect(
      validateReferral(referral, {
        ...context,
        now: "2026-08-02T00:00:00.000Z",
      }),
    ).toEqual({ valid: false, reason: "REFERRAL_INVALID" });
    expect(
      validateReferral(referral, { ...context, subtotalMinor: 10_000 }),
    ).toEqual({ valid: false, reason: "REFERRAL_INVALID" });
  });
});
