import { z } from "zod";

export const WASH_DRAFT_STORAGE_KEY = "washpro:new-wash:v1";

const persistedDraftSchema = z.object({
  version: z.literal(1),
  step: z.number().int().min(0).max(6),
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
});

export type PersistedWashDraft = z.infer<typeof persistedDraftSchema>;

export type WashDraftInput = Omit<PersistedWashDraft, "version">;

export function serializeWizardDraft(draft: WashDraftInput): string {
  return JSON.stringify({ ...draft, version: 1 });
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
    const result = persistedDraftSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
