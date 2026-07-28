import { z } from "zod";

export const WASH_DRAFT_STORAGE_KEY = "washpro:new-wash:v1";

const COORDINATE_ONLY = /^\s*(?:(?:lat(?:itude)?|lng|lon(?:g(?:itude)?)?)\s*[:=]\s*)?-?\d{1,2}(?:\.\d+)?\s*[°d]?\s*[NS]?\s*[,;\s]+\s*(?:(?:lat(?:itude)?|lng|lon(?:g(?:itude)?)?)\s*[:=]\s*)?-?\d{1,3}(?:\.\d+)?\s*[°d]?\s*[EW]?\s*$/i;

export const STEP_IDS = [
  "customer",
  "vehicle",
  "assign",
  "photo-location",
  "services",
  "benefits",
  "review",
] as const;

export type StepId = (typeof STEP_IDS)[number];

const STEP_IDS_LIST: readonly StepId[] = STEP_IDS;

const OLD_STEP_TO_NEW_STEP: Record<number, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 4,
  4: 5,
  5: 2,
  6: 6,
};

const persistedDraftSchema = z.object({
  version: z.literal(2),
  step: z.number().int().min(0).max(6),
  stepId: z.enum(STEP_IDS),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
  servicePriceId: z.string().optional(),
  addOnServiceIds: z.array(z.string()).default([]),
  couponCode: z.string().max(64).optional(),
  referralCode: z.string().max(64).optional(),
  rewardId: z.string().optional(),
  rewardUnits: z.number().int().nonnegative().default(0),
  manualDiscountMinor: z.number().int().nonnegative().default(0),
  manualDiscountReason: z.string().max(500).optional(),
  assignedUserId: z.string().optional(),
  startImmediately: z.boolean().default(false),
  photoAssetId: z.string().optional(),
  place: z.string().refine(
    (val) => !COORDINATE_ONLY.test(val),
    { message: "Location place must be a human-readable place name, not raw coordinates." },
  ).optional(),
  capturedAt: z.string().optional(),
}).refine(
  (data) =>
    (data.place === undefined && data.capturedAt === undefined) ||
    (data.place !== undefined && data.capturedAt !== undefined),
  { message: "Both place and capturedAt must be present or both absent." },
);

export type PersistedWashDraft = z.infer<typeof persistedDraftSchema>;

export type WashDraftInput = Omit<PersistedWashDraft, "version">;

export function serializeWizardDraft(draft: WashDraftInput): string {
  const cleaned = { ...draft };
  if (
    typeof cleaned.place === "string" &&
    COORDINATE_ONLY.test(cleaned.place.trim())
  ) {
    delete cleaned.place;
    delete cleaned.capturedAt;
  }
  return JSON.stringify({ ...cleaned, version: 2 });
}

export function parseWizardDraft(
  value: string | null,
): PersistedWashDraft | null {
  if (value === null) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (
      raw.addOnServiceIds === undefined &&
      Array.isArray(raw.addOnPriceIds)
    ) {
      raw.addOnServiceIds = raw.addOnPriceIds;
    }
    delete raw.addOnPriceIds;
    if (raw.version === 1) {
      const oldStep = (raw.step as number) ?? 0;
      raw.step = OLD_STEP_TO_NEW_STEP[oldStep] ?? 0;
      raw.stepId = STEP_IDS_LIST[raw.step as number] ?? STEP_IDS_LIST[0];
      raw.version = 2;
    }
    if (typeof raw.place === "string") {
      const trimmed = raw.place.trim();
      if (trimmed === "" || COORDINATE_ONLY.test(trimmed)) {
        delete raw.place;
      } else {
        raw.place = trimmed;
      }
    }
    if (
      (raw.place !== undefined) !== (raw.capturedAt !== undefined)
    ) {
      delete raw.place;
      delete raw.capturedAt;
    }
    const result = persistedDraftSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
