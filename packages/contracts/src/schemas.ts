import { z } from "zod";

import {
  DISCOUNT_TYPES,
  ERROR_CODES,
  LOCATION_STATUSES,
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
export const locationStatusSchema = z.enum(LOCATION_STATUSES);
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

export const paymentInputSchema = z.object({
  washJobId: identifierSchema,
  amountMinor: positiveMoneyMinorSchema,
  method: paymentMethodSchema,
  transactionReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
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
