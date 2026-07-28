import { describe, expect, it } from "vitest";

import { parseWizardDraft, serializeWizardDraft } from "./wizard-draft";

describe("New Wash draft persistence", () => {
  it("preserves safe selections across sessions", () => {
    const value = serializeWizardDraft({
      step: 2,
      stepId: "assign",
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
      step: 2,
      stepId: "assign",
      customerId: "customer-1",
      addOnServiceIds: ["addon-1"],
      rewardId: "reward-1",
      rewardUnits: 250,
      manualDiscountMinor: 100,
    });
  });

  it("persists evidence metadata", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      customerId: "customer-1",
      vehicleId: "vehicle-1",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
      photoAssetId: "asset-1",
      place: "123 Main St, Springfield",
      capturedAt: "2026-07-28T12:00:00.000Z",
    });

    const parsed = parseWizardDraft(value);
    expect(parsed).toMatchObject({
      step: 3,
      stepId: "photo-location",
      photoAssetId: "asset-1",
      place: "123 Main St, Springfield",
      capturedAt: "2026-07-28T12:00:00.000Z",
    });
  });

  it("migrates addOnPriceIds from legacy session storage to addOnServiceIds", () => {
    const legacy = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      addOnServiceIds: ["legacy-addon"],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
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

  it("rejects drafts with invalid version", () => {
    expect(
      parseWizardDraft(JSON.stringify({ version: 99, step: 2 })),
    ).toBeNull();
  });
});

describe("Old wizard step migration", () => {
  const OLD_TO_NEW: Record<number, { step: number; stepId: string }> = {
    0: { step: 0, stepId: "customer" },
    1: { step: 1, stepId: "vehicle" },
    2: { step: 3, stepId: "photo-location" },
    3: { step: 4, stepId: "services" },
    4: { step: 5, stepId: "benefits" },
    5: { step: 2, stepId: "assign" },
    6: { step: 6, stepId: "review" },
  };

  for (const [oldStep, expected] of Object.entries(OLD_TO_NEW)) {
    it(`migrates old step ${oldStep} to new step ${expected.step} (${expected.stepId})`, () => {
      const oldRaw = JSON.stringify({
        version: 1,
        step: Number(oldStep),
        customerId: "customer-1",
        vehicleId: "vehicle-1",
      });

      const parsed = parseWizardDraft(oldRaw);
      expect(parsed).not.toBeNull();
      expect(parsed!.step).toBe(expected.step);
      expect(parsed!.stepId).toBe(expected.stepId);
    });
  }

  it("clamps out-of-range old step to 0", () => {
    const oldRaw = JSON.stringify({
      version: 1,
      step: 99,
      customerId: "customer-1",
    });

    const parsed = parseWizardDraft(oldRaw);
    expect(parsed).not.toBeNull();
    expect(parsed!.step).toBe(0);
    expect(parsed!.stepId).toBe("customer");
  });

  it("preserves assignedUserId through migration", () => {
    const oldRaw = JSON.stringify({
      version: 1,
      step: 5,
      assignedUserId: "staff-1",
    });

    const parsed = parseWizardDraft(oldRaw);
    expect(parsed).not.toBeNull();
    expect(parsed!.step).toBe(2);
    expect(parsed!.assignedUserId).toBe("staff-1");
  });
});

describe("Evidence draft consistency", () => {
  it("accepts place and capturedAt together", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      place: "123 Main St",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBe("123 Main St");
    expect(parsed!.capturedAt).toBe("2026-07-28T12:00:00.000Z");
  });

  it("normalizes place without capturedAt to no-location", () => {
    const raw = JSON.stringify({
      version: 2,
      step: 3,
      stepId: "photo-location",
      place: "123 Main St",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("normalizes capturedAt without place to no-location", () => {
    const raw = JSON.stringify({
      version: 2,
      step: 3,
      stepId: "photo-location",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("accepts neither place nor capturedAt", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("rejects coordinate-only place", () => {
    const raw = JSON.stringify({
      version: 2,
      step: 3,
      stepId: "photo-location",
      place: "51.5074° N, 0.1278° W",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("rejects coordinate-only place through serialize", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      place: "lat: 40.7128, lon: -74.0060",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("normalizes whitespace-only place to no-location", () => {
    const raw = JSON.stringify({
      version: 2,
      step: 3,
      stepId: "photo-location",
      place: "   ",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBeUndefined();
    expect(parsed!.capturedAt).toBeUndefined();
  });

  it("trims place whitespace", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      place: "  123 Main St  ",
      capturedAt: "2026-07-28T12:00:00.000Z",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.place).toBe("123 Main St");
  });

  it("does not persist blob URLs or raw image data", () => {
    const value = serializeWizardDraft({
      step: 3,
      stepId: "photo-location",
      photoAssetId: "asset-1",
      addOnServiceIds: [],
      rewardUnits: 0,
      manualDiscountMinor: 0,
      startImmediately: false,
    });
    const parsed = parseWizardDraft(value);
    expect(parsed).not.toBeNull();
    expect(parsed!.photoAssetId).toBe("asset-1");
    const raw = JSON.parse(value) as Record<string, unknown>;
    expect(raw.photoPreview).toBeUndefined();
    expect(raw.blob).toBeUndefined();
  });
});
