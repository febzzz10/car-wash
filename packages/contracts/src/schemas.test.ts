import { describe, expect, it } from "vitest";

import {
  benefitsInputSchema,
  fileMetadataSchema,
  isBenefitReplacementRequest,
  moneyMinorSchema,
  paginationSchema,
  paymentInputSchema,
  validateBenefitsInput,
  washJobStatusSchema,
} from "./schemas";
import { PAYMENT_METHOD_LABELS } from "./enums";

describe("shared contract schemas", () => {
  it("accepts every documented wash job status", () => {
    const statuses = [
      "DRAFT",
      "WAITING",
      "IN_PROGRESS",
      "PAUSED",
      "COMPLETED",
      "CANCELLED",
    ];

    expect(statuses.map((status) => washJobStatusSchema.parse(status))).toEqual(
      statuses,
    );
  });

  it("rejects fractional and negative minor-unit money", () => {
    expect(moneyMinorSchema.safeParse(1050).success).toBe(true);
    expect(moneyMinorSchema.safeParse(10.5).success).toBe(false);
    expect(moneyMinorSchema.safeParse(-1).success).toBe(false);
  });

  it("normalizes pagination defaults and caps page size", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationSchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(
      false,
    );
  });

  it("rejects unsafe file metadata", () => {
    expect(
      fileMetadataSchema.safeParse({
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
        checksumSha256: "a".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      fileMetadataSchema.safeParse({
        mimeType: "image/jpeg",
        sizeBytes: 0,
        checksumSha256: "not-a-checksum",
      }).success,
    ).toBe(false);
  });
});

// ---- Benefit schema tests ----

describe("benefitsInputSchema", () => {
  it("accepts complete replacement with coupon and referral", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, couponCode: "WELCOME10", referralCode: "REF123",
      manualDiscountMinor: 0,
    });
    expect(r.success).toBe(true);
  });

  it("explicit empty replacement clears benefits", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, manualDiscountMinor: 0,
    });
    expect(r.success).toBe(true);
    expect(r.data?.couponCode).toBeUndefined();
  });

  it("rejects missing replaceExisting", () => {
    const r = benefitsInputSchema.safeParse({ couponCode: "X", manualDiscountMinor: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown nested fields via strict", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, manualDiscountMinor: 0, unknownField: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rewardId without rewardAmountMinor fails with correct path", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, rewardId: "abc12345678", manualDiscountMinor: 0,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some(i => i.path.includes("rewardAmountMinor"))).toBe(true);
  });

  it("manual discount > 0 without reason fails with correct path", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, manualDiscountMinor: 5000,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some(i => i.path.includes("manualDiscountReason"))).toBe(true);
  });

  it("blank coupon code normalizes to undefined", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, couponCode: "   ", manualDiscountMinor: 0,
    });
    expect(r.success).toBe(true);
    expect(r.data?.couponCode).toBeUndefined();
  });
});

describe("paymentInputSchema extended", () => {
  it("benefits omitted + amount zero is rejected", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 0, method: "CASH", idempotencyKey: "k".repeat(16),
    });
    expect(r.success).toBe(false);
  });

  it("benefits with replaceExisting + amount zero is accepted", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 0, method: "CASH", idempotencyKey: "k".repeat(16),
      expectedVersion: 1, benefits: { replaceExisting: true, manualDiscountMinor: 0 },
    });
    expect(r.success).toBe(true);
  });

  it("expectedVersion required with replaceExisting", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 5000, method: "CASH", idempotencyKey: "k".repeat(16),
      benefits: { replaceExisting: true, manualDiscountMinor: 0 },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some(i => i.path.includes("expectedVersion"))).toBe(true);
  });

  it("benefits omitted preserves existing behavior", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 5000, method: "CASH", idempotencyKey: "k".repeat(16),
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown top-level field via strict", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 5000, method: "CASH", idempotencyKey: "k".repeat(16),
      extraField: "nope",
    });
    expect(r.success).toBe(false);
  });
});

describe("payment method values", () => {
  it("accepts every canonical method", () => {
    for (const method of ["CASH", "UPI", "BANK_UPI", "PAYTM"] as const) {
      const r = paymentInputSchema.safeParse({
        washJobId: "j".repeat(8), amountMinor: 5000, method, idempotencyKey: "k".repeat(16),
      });
      expect(r.success, method).toBe(true);
    }
  });

  it("rejects legacy methods", () => {
    for (const method of ["CARD", "BANK_TRANSFER", "OTHER"] as const) {
      const r = paymentInputSchema.safeParse({
        washJobId: "j".repeat(8), amountMinor: 5000, method, idempotencyKey: "k".repeat(16),
      });
      expect(r.success, method).toBe(false);
    }
  });

  it("rejects arbitrary methods", () => {
    const r = paymentInputSchema.safeParse({
      washJobId: "j".repeat(8), amountMinor: 5000, method: "CHEQUE", idempotencyKey: "k".repeat(16),
    });
    expect(r.success).toBe(false);
  });

  it("labels every canonical and legacy method", () => {
    for (const method of ["CASH", "UPI", "BANK_UPI", "PAYTM", "CARD", "BANK_TRANSFER", "OTHER"] as const) {
      expect(PAYMENT_METHOD_LABELS[method].length, method).toBeGreaterThan(0);
    }
  });
});

describe("isBenefitReplacementRequest", () => {
  it("returns true for replacement", () => {
    expect(isBenefitReplacementRequest({ replaceExisting: true, manualDiscountMinor: 0 })).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isBenefitReplacementRequest(undefined)).toBe(false);
  });
});

describe("validateBenefitsInput standalone", () => {
  it("manual discount reason without amount fails", () => {
    const issues: { path: (string | number)[]; message: string }[] = [];
    validateBenefitsInput(
      { manualDiscountMinor: 0, manualDiscountReason: "a reason" },
      {
        addIssue: (i: { path: (string | number)[]; message: string }) => issues.push({ path: i.path, message: i.message }),
        path: [],
      } as unknown as import("zod").RefinementCtx,
    );
    expect(issues.some(i => i.path.includes("manualDiscountReason"))).toBe(true);
  });

  it("rejects rewardId without rewardAmountMinor", () => {
    const issues: { path: (string | number)[]; message: string }[] = [];
    validateBenefitsInput(
      { rewardId: "abc12345678" },
      {
        addIssue: (i: { path: (string | number)[]; message: string }) => issues.push({ path: i.path, message: i.message }),
        path: [],
      } as unknown as import("zod").RefinementCtx,
    );
    expect(issues.some(i => i.path.includes("rewardAmountMinor"))).toBe(true);
  });
});
