import { z } from "zod";

import {
  DISCOUNT_TYPES,
  ERROR_CODES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  SERVICE_KINDS,
  TIMER_EVENTS,
  USER_ROLES,
  USER_STATUSES,
  VEHICLE_TYPES,
  WASH_JOB_STATUSES,
} from "./enums";

export const identifierSchema = z.string().trim().min(8).max(64);
export const isoTimestampSchema = z.iso.datetime({ offset: true });
export const dateOnlySchema = z.iso.date();
export const moneyMinorSchema = z.number().int().nonnegative().safe();
export const positiveMoneyMinorSchema = z.number().int().positive().safe();
export const basisPointsSchema = z.number().int().min(0).max(10_000);

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const washJobStatusSchema = z.enum(WASH_JOB_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const timerEventSchema = z.enum(TIMER_EVENTS);
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export const serviceKindSchema = z.enum(SERVICE_KINDS);
export const permissionSchema = z.enum(PERMISSIONS);
export const errorCodeSchema = z.enum(ERROR_CODES);
export const vehicleTypeCodeSchema = z.enum(VEHICLE_TYPES);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const fileMetadataSchema = z.object({
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(8).max(256),
});

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  email: z.email().max(254).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const vehicleInputSchema = z.object({
  customerId: identifierSchema,
  vehicleTypeCode: vehicleTypeCodeSchema,
  registrationNumber: z.string().trim().min(3).max(24),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  manufacturingYear: z.number().int().min(1900).max(2200).optional(),
  colour: z.string().trim().max(40).optional(),
  fuelType: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const vehicleModelSuggestQuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

// ---- Shared benefit schemas ----

const optionalBenefitCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().max(40).optional(),
);

export const benefitSelectionShape = {
  couponCode: optionalBenefitCodeSchema,
  referralCode: optionalBenefitCodeSchema,
  rewardId: identifierSchema.optional(),
  rewardAmountMinor: positiveMoneyMinorSchema.optional(),
  manualDiscountMinor: moneyMinorSchema.default(0),
  manualDiscountReason: z.string().trim().min(5).max(500).optional(),
};

export function validateBenefitsInput(
  data: {
    rewardId?: string | undefined;
    rewardAmountMinor?: number | undefined;
    manualDiscountMinor?: number | undefined;
    manualDiscountReason?: string | undefined;
  },
  ctx: z.RefinementCtx,
) {
  const hasRewardId = data.rewardId !== undefined;
  const hasRewardAmount = data.rewardAmountMinor !== undefined;
  if (hasRewardId !== hasRewardAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rewardId and rewardAmountMinor must be provided together.",
      path: hasRewardId ? ["rewardAmountMinor"] : ["rewardId"],
    });
  }
  const d = data.manualDiscountMinor ?? 0;
  if (d > 0 && data.manualDiscountReason === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Manual discount reason is required.",
      path: ["manualDiscountReason"],
    });
  }
  if (d === 0 && data.manualDiscountReason !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Manual discount reason cannot be provided without a discount.",
      path: ["manualDiscountReason"],
    });
  }
}

export const benefitsInputSchema = z
  .object({
    replaceExisting: z.literal(true),
    ...benefitSelectionShape,
  })
  .strict()
  .superRefine(validateBenefitsInput);

export type BenefitsInput = z.infer<typeof benefitsInputSchema>;

export function isBenefitReplacementRequest(
  b: BenefitsInput | undefined,
): b is BenefitsInput {
  return b?.replaceExisting === true;
}

const paymentBaseSchema = z.object({
  washJobId: identifierSchema,
  method: paymentMethodSchema,
  transactionReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
});

export const paymentInputSchema = paymentBaseSchema
  .extend({
    amountMinor: moneyMinorSchema,
    benefits: benefitsInputSchema.optional(),
    expectedVersion: z.number().int().positive().safe().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasReplacement = isBenefitReplacementRequest(data.benefits);
    if (data.amountMinor === 0 && !hasReplacement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment amount must be positive when no benefits are applied.",
        path: ["amountMinor"],
      });
    }
    if (hasReplacement && data.expectedVersion === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expectedVersion is required with benefit replacement.",
        path: ["expectedVersion"],
      });
    }
  });

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiListSuccess<T> extends ApiSuccess<readonly T[]> {
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: z.infer<typeof errorCodeSchema>;
    readonly message: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly requestId: string;
  };
}

export const verifyBenefitsRequestSchema = z.object({
  expectedVersion: z.number().int().positive().safe(),
  benefits: benefitsInputSchema,
}).strict();

export const appliedBenefitsSchema = z.object({
  coupon: z.object({
    id: z.string(), code: z.string(), discountMinor: z.number(),
  }).nullable(),
  referral: z.object({
    redemptionId: z.string(), code: z.string(), discountMinor: z.number(),
  }).nullable(),
  reward: z.object({
    id: z.string(), amountMinor: z.number(),
  }).nullable(),
  manualDiscount: z.object({
    amountMinor: z.number(), reason: z.string(),
  }).nullable(),
});

export type AppliedBenefits = z.infer<typeof appliedBenefitsSchema>;
