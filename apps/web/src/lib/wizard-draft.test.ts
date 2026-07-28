import { describe, expect, it } from "vitest";

import { parseWizardDraft, serializeWizardDraft } from "./wizard-draft";

describe("New Wash draft persistence", () => {
  it("preserves safe selections across sessions", () => {
    const value = serializeWizardDraft({
      step: 5,
      customerId: "customer-1",
      vehicleId: "vehicle-1",
      servicePriceId: "price-1",
      addOnServiceIds: ["addon-1"],
      couponCode: "WELCOME",
      referralCode: "REFER123",
      rewardUnits: 250,
      rewardId: "reward-1",
      manualDiscountMinor: 100,
      manualDiscountReason: "Service recovery",
      assignedUserId: "staff-1",
      startImmediately: true,
    });

    expect(parseWizardDraft(value)).toMatchObject({
      step: 5,
      customerId: "customer-1",
      addOnServiceIds: ["addon-1"],
      rewardId: "reward-1",
      rewardUnits: 250,
      manualDiscountMinor: 100,
    });
  });

  it("migrates addOnPriceIds from legacy session storage to addOnServiceIds", () => {
    const legacy = JSON.stringify({
      version: 1,
      step: 3,
      addOnPriceIds: ["legacy-addon"],
    });
    expect(parseWizardDraft(legacy)).toMatchObject({
      step: 3,
      addOnServiceIds: ["legacy-addon"],
    });
  });

  it("rejects malformed and obsolete drafts", () => {
    expect(parseWizardDraft("not json")).toBeNull();
    expect(
      parseWizardDraft(JSON.stringify({ version: 0, step: 2 })),
    ).toBeNull();
  });
});
