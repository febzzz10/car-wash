# Benefits & Rewards in Record Payment Dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Benefits & Rewards section to the Record Payment dialog on the Wash Job Detail page, reusing the New Wash wizard's benefit validation schemas and lifecycle, with atomic D1 application + first-payment recording.

**Architecture:** Extend the existing `POST /api/v1/payments/` endpoint with an optional `benefits` block. Introduce a `financial_operation_guards` table for atomic precondition checking via CHECK-constraint failures. Add a preview-only `POST /api/v1/wash-jobs/:id/verify-benefits` endpoint. Add `billing_locked_at` and `rounding_mode` columns to `wash_jobs` via migration 0016.

**Tech Stack:** Hono, Zod, Cloudflare Workers + D1, React/Vite, vitest

## Global Constraints

- Derive source from design doc: `docs/superpowers/specs/2026-07-29-record-payment-benefits-and-rewards-design.md`
- All design decisions in that document are finalized — do not redesign
- `pnpm install --frozen-lockfile` before any changes
- Reuse existing hooks, schemas, services, components; never duplicate business logic
- Backend validation is source of truth; frontend validation is convenience only
- Strict TypeScript: no `any`, `@ts-ignore`, or rule disabling
- Use `strict()` on Zod schemas
- Use `ApiError` for all server errors; keep `fields` for inline error mapping
- Audit every state-changing operation via `auditStatement()`
- Use parameterised D1 queries; never concatenate user input into SQL
- `meta.changes` is diagnostics only; correctness comes from in-batch guard CHECK failures
- Store monetary values as integer minor units; use `money(` display helper
- Do not commit, push, migrate to production, or deploy
- Migration 0016 must not be applied to remote D1
- No KV, R2, or external side effects in the payment-and-benefit operation
- No zero-value payment records

---

### Task 0: Preflight and baseline verification

**Files:**
- No file changes — read-only inspection

**Interfaces:**
- Consumes: entire repository state
- Produces: baseline test results, migration number confirmation

- [ ] **Step 1: Record git status**

```bash
git status --short
```
Expected: only untracked design doc `docs/superpowers/specs/2026-07-29-record-payment-benefits-and-rewards-design.md`.

- [ ] **Step 2: Confirm migration 0016 is available**

```bash
Get-ChildItem -Path "apps\api\migrations" -Name | Select-Object -Last 3
```
Expected: `0015_assigned_user_name_snapshot.sql` is the latest. No `0016_*.sql` exists.

- [ ] **Step 3: Run existing focused tests**

```bash
pnpm --filter @washpro/contracts test
pnpm --filter @washpro/domain test
pnpm --filter @washpro/api test
pnpm --filter @washpro/web test
```
Expected: all pass. Record any pre-existing failures before proceeding — report them, do not silently fix them.

- [ ] **Step 4: Run full baseline**

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r build
```
Expected: all pass.

- [ ] **Step 5: Do not commit**

No changes have been made. This task is verification only.

---

### Task 1: Shared contracts and schemas

**Files:**
- Modify: `packages/contracts/src/schemas.ts`
- Modify: `packages/contracts/src/schemas.test.ts`

**Interfaces:**
- Consumes: `identifierSchema`, `moneyMinorSchema`, `positiveMoneyMinorSchema`, `paymentMethodSchema`, existing `paymentInputSchema`, `createJobSchema`
- Produces: `optionalBenefitCodeSchema`, `benefitSelectionShape`, `validateBenefitsInput`, `benefitsInputSchema`, `BenefitsInput`, `isBenefitReplacementRequest`, revised `paymentInputSchema`, `AppliedBenefits`, `CombinedPaymentResult`, `verifyBenefitsRequestSchema`, `verifyBenefitsResponseSchema`

- [ ] **Step 1: Add `optionalBenefitCodeSchema` and `benefitSelectionShape`**

In `packages/contracts/src/schemas.ts`, after `paymentInputSchema` (line 95):

```ts
// ---- Shared benefit schemas ----

const optionalBenefitCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().max(40).optional(),
);

const benefitSelectionShape = {
  couponCode: optionalBenefitCodeSchema,
  referralCode: optionalBenefitCodeSchema,
  rewardId: identifierSchema.optional(),
  rewardAmountMinor: positiveMoneyMinorSchema.optional(),
  manualDiscountMinor: moneyMinorSchema.default(0),
  manualDiscountReason: z.string().trim().min(5).max(500).optional(),
};
```

- [ ] **Step 2: Add `validateBenefitsInput`**

After `benefitSelectionShape`:

```ts
function validateBenefitsInput(
  data: {
    rewardId?: string;
    rewardAmountMinor?: number;
    manualDiscountMinor?: number;
    manualDiscountReason?: string;
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
```

- [ ] **Step 3: Add `benefitsInputSchema`, `BenefitsInput`, `isBenefitReplacementRequest`**

After `validateBenefitsInput`:

```ts
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
```

- [ ] **Step 4: Update `createJobSchema` to use shared shape**

Replace the inline benefit fields in `createJobSchema` with `...benefitSelectionShape` and add `.superRefine(validateBenefitsInput)`. The `createJobSchema` is currently at lines 31–61 of `wash-jobs.ts` (in the API, not contracts). It needs to move to contracts for shared access.

**Important**: Since `createJobSchema` is defined in `apps/api/src/routes/wash-jobs.ts:31–61` — not in contracts — and it currently has inline benefit fields, we have two options:

A. **Export `benefitSelectionShape` from contracts** and use it in wash-jobs.ts to reconstruct createJobSchema with the shared refinements. This is the recommended approach since it keeps the schema in the API file (it uses local `idSchema` and `location` schema which are API-route-local).

B. Move the entire createJobSchema to contracts. This is a larger refactor.

**Go with Option A.** Export `benefitSelectionShape` and `validateBenefitsInput` from contracts. The wash-jobs.ts route file will be updated in Task 4.

Add export for the shape (it's already a `const`, just add `export`):

```ts
export { benefitSelectionShape, validateBenefitsInput };
```

Wait — `benefitSelectionShape` is a plain object, not exported yet. Export it:

```diff
- const benefitSelectionShape = {
+ export const benefitSelectionShape = {
```

And export `validateBenefitsInput`:

```diff
- function validateBenefitsInput(
+ export function validateBenefitsInput(
```

- [ ] **Step 5: Revise `paymentInputSchema`**

Replace the current `paymentInputSchema` (lines 88–95) with:

```ts
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
```

- [ ] **Step 6: Add preview schemas**

After paymentInputSchema:

```ts
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
```

- [ ] **Step 7: Write schema tests**

In `packages/contracts/src/schemas.test.ts`, add a describe block for each new/changed schema. Key tests:

```ts
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
    expect(r.data?.referralCode).toBeUndefined();
  });

  it("rejects missing replaceExisting", () => {
    const r = benefitsInputSchema.safeParse({ couponCode: "X", manualDiscountMinor: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown nested fields", () => {
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

  it("manual discount reason without amount fails", () => {
    const r = benefitsInputSchema.safeParse({
      replaceExisting: true, manualDiscountMinor: 0, manualDiscountReason: "reason",
    });
    expect(r.success).toBe(false);
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
  function validPayment() {
    return {
      washJobId: "j".repeat(8), amountMinor: 5000, method: "CASH" as const,
      idempotencyKey: "k".repeat(16),
    };
  }

  it("benefits omitted preserves existing behavior", () => {
    expect(paymentInputSchema.safeParse(validPayment()).success).toBe(true);
  });

  it("benefits omitted + amount zero is rejected", () => {
    expect(paymentInputSchema.safeParse({ ...validPayment(), amountMinor: 0 }).success).toBe(false);
  });

  it("benefits with replaceExisting + amount zero is accepted", () => {
    expect(paymentInputSchema.safeParse({
      ...validPayment(), amountMinor: 0, expectedVersion: 1,
      benefits: { replaceExisting: true, manualDiscountMinor: 0 },
    }).success).toBe(true);
  });

  it("expectedVersion required with replaceExisting", () => {
    const r = paymentInputSchema.safeParse({
      ...validPayment(),
      benefits: { replaceExisting: true, manualDiscountMinor: 0 },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some(i => i.path.includes("expectedVersion"))).toBe(true);
  });

  it("rejects unknown top-level field", () => {
    expect(paymentInputSchema.safeParse({ ...validPayment(), unknownField: "x" }).success).toBe(false);
  });
});

describe("createJobSchema rejects replaceExisting", () => {
  // This test runs in contracts but createJobSchema lives in the API route.
  // We test the shared shape + refine is re-exportable; the actual schema test
  // lives in the API test suite after Task 4 updates the route.
  it("validateBenefitsInput rejects dummy replaceExisting on shape-only parse", () => {
    // Just verify the refine function works standalone
    const issues: z.ZodIssue[] = [];
    const ctx: z.RefinementCtx = {
      addIssue: (i) => issues.push(i),
      path: [],
    };
    validateBenefitsInput({ rewardId: "abc", manualDiscountMinor: 0 }, ctx);
    expect(issues.some(i => i.message.includes("rewardAmountMinor"))).toBe(true);
  });
});
```

- [ ] **Step 8: Run contracts tests**

```bash
pnpm --filter @washpro/contracts test
```
Expected: all tests pass including the new ones.

- [ ] **Step 9: Run contracts typecheck**

```bash
pnpm --filter @washpro/contracts typecheck
```
Expected: pass.

---

### Task 2: Shared domain and service helpers

**Files:**
- Modify: `packages/domain/src/billing.ts`
- Modify: `packages/domain/src/billing.test.ts`

**Interfaces:**
- Consumes: `calculateBill`, `BillInput`, `BillResult`
- Produces: `AppliedBenefits` (domain type), `ReplacementResult` type, no new API-route logic yet

- [ ] **Step 1: Verify `calculateBill` works with zero round-trip inputs**

In `packages/domain/src/billing.test.ts`, add a test:

```ts
it("returns totalAmountMinor of 0 when discounts cover the full subtotal", () => {
  const result = calculateBill({
    items: [{ unitPriceMinor: 10000, quantity: 1 }],
    couponDiscountMinor: 6000,
    referralDiscountMinor: 2000,
    rewardDiscountMinor: 1000,
    manualDiscountMinor: 1000,
    taxRateBasisPoints: 0,
    roundingMode: "NONE",
  });
  expect(result.totalAmountMinor).toBe(0);
  expect(result.totalDiscountMinor).toBe(10000);
});
```

- [ ] **Step 2: Run domain tests**

```bash
pnpm --filter @washpro/domain test
```
Expected: pass.

- [ ] **Step 3: Add `ReplacementResult` and comparison types**

In `packages/domain/src/billing.ts`, add near the top (before `calculateBill`):

```ts
export interface BenefitComparison {
  readonly couponChanged: boolean;
  readonly referralChanged: boolean;
  readonly rewardChanged: boolean;
  readonly manualDiscountChanged: boolean;
  readonly effectiveCouponId: string | null;
  readonly effectiveReferralRedemptionId: string | null;
  readonly effectiveRewardId: string | null;
}
```

This is a domain type only — no DB reads. The actual comparison logic stays in the API route where DB access exists.

---

### Task 3: Migration 0016

**Files:**
- Create: `apps/api/migrations/0016_billing_lock_and_benefits.sql`
- Modify: `apps/api/test/migrations.test.ts`

**Interfaces:**
- Consumes: existing wash_jobs, referrals_rewards, referral_reward_transactions schemas
- Produces: new columns on wash_jobs and referral_rewards, new financial_operation_guards table

- [ ] **Step 1: Create the migration file**

```sql
-- 0016_billing_lock_and_benefits.sql

ALTER TABLE wash_jobs ADD COLUMN billing_locked_at TEXT;
ALTER TABLE wash_jobs ADD COLUMN rounding_mode TEXT
  CHECK (rounding_mode IS NULL OR rounding_mode IN ('NONE', 'NEAREST_RUPEE'));

CREATE TABLE financial_operation_guards (
  operation_id TEXT NOT NULL,
  guard_name TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation_id, guard_name)
);

ALTER TABLE referral_rewards ADD COLUMN active_reservation_transaction_id TEXT;
ALTER TABLE referral_rewards ADD COLUMN active_reservation_amount_minor
  INTEGER NOT NULL DEFAULT 0 CHECK (active_reservation_amount_minor >= 0);

-- Backfill rounding_mode
UPDATE wash_jobs SET rounding_mode = 'NEAREST_RUPEE'
WHERE rounding_minor <> 0 AND rounding_mode IS NULL;

-- Backfill billing lock
UPDATE wash_jobs SET billing_locked_at = COALESCE(
  (SELECT MIN(p.created_at) FROM payments p
   WHERE p.wash_job_id = wash_jobs.id AND p.status = 'SUCCESS'),
  updated_at
)
WHERE billing_locked_at IS NULL
  AND (paid_amount_minor > 0 OR payment_status = 'PAID');

-- Backfill active reward reservation (unambiguous only)
-- Terminal transaction types that invalidate an active RESERVE:
--   RELEASE, REDEEM, EXPIRE, CANCEL, ADMIN_ADJUSTMENT
-- (matches the CHECK constraint in migration 0005)
UPDATE referral_rewards SET
  active_reservation_transaction_id = (
    SELECT id FROM referral_reward_transactions
    WHERE referral_reward_id = referral_rewards.id
      AND wash_job_id = referral_rewards.reserved_for_wash_job_id
      AND transaction_type = 'RESERVE'
      AND amount_minor > 0
  ),
  active_reservation_amount_minor = (
    SELECT amount_minor FROM referral_reward_transactions
    WHERE referral_reward_id = referral_rewards.id
      AND wash_job_id = referral_rewards.reserved_for_wash_job_id
      AND transaction_type = 'RESERVE'
      AND amount_minor > 0
  )
WHERE status = 'RESERVED'
  AND active_reservation_transaction_id IS NULL
  AND reserved_for_wash_job_id IS NOT NULL
  AND (SELECT COUNT(*) FROM referral_reward_transactions
       WHERE referral_reward_id = referral_rewards.id
         AND wash_job_id = referral_rewards.reserved_for_wash_job_id
         AND transaction_type = 'RESERVE'
         AND amount_minor > 0) = 1
  AND NOT EXISTS (
    SELECT 1 FROM referral_reward_transactions terminal
    WHERE terminal.referral_reward_id = referral_rewards.id
      AND terminal.wash_job_id = referral_rewards.reserved_for_wash_job_id
      AND terminal.transaction_type IN (
        'RELEASE', 'REDEEM', 'EXPIRE', 'CANCEL', 'ADMIN_ADJUSTMENT'
      )
  );
```

- [ ] **Step 2: Test migration via vitest**

In `apps/api/test/migrations.test.ts`, add migration 0016 assertions. The existing migrations test file uses vitest with D1. Add a test that:

1. Applies migrations 0001–0016 against a clean D1.
2. Asserts `billing_locked_at` exists on wash_jobs (nullable).
3. Asserts `rounding_mode` exists on wash_jobs with CHECK constraint.
4. Asserts `financial_operation_guards` table exists with CHECK on `passed`.
5. Asserts `active_reservation_transaction_id` and `active_reservation_amount_minor` exist on referral_rewards.
6. Inserts a paid job fixture, runs backfill, asserts billing_locked_at is set.
7. Inserts a fully discounted job fixture (PAID, paid=0), runs backfill, asserts billing_locked_at is set.
8. Inserts a rounding_minor <> 0 fixture, asserts backfill sets NEAREST_RUPEE.
9. Inserts a rounding_minor = 0 fixture, asserts rounding_mode remains NULL.
10. Inserts an unambiguous reserved reward fixture, asserts active columns backfill.
11. Inserts an ambiguous reserved reward (multiple RESERVE cycles), asserts active columns remain NULL.
12. Inserts a guard with passed=0, asserts CHECK constraint rejects it.

- [ ] **Step 3: Run migration-specific tests**

```bash
pnpm --filter @washpro/api test -- migrations
```
Expected: pass.

- [ ] **Step 4: Do not apply migration to remote D1**

---

### Task 4: New Wash compatibility updates

**Files:**
- Modify: `apps/api/src/routes/wash-jobs.ts`
- Modify: `apps/api/test/wash-payments.test.ts` (or the wash-jobs creation test)

**Interfaces:**
- Consumes: `createJobSchema` (lines 31–61), `benefitSelectionShape`, `validateBenefitsInput` from contracts
- Produces: updated create-job route that stores rounding_mode and active reservation columns

- [ ] **Step 1: Import shared benefit contracts**

At the top of `apps/api/src/routes/wash-jobs.ts`, add to the imports:

```ts
import {
  benefitSelectionShape,
  validateBenefitsInput,
} from "@washpro/contracts";
```

- [ ] **Step 2: Update `createJobSchema`**

Replace the inline benefit fields (couponCode, referralCode, rewardAmountMinor, rewardId, manualDiscountMinor, manualDiscountReason) in `createJobSchema` with `...benefitSelectionShape` and add `.superRefine(validateBenefitsInput)`.

Current (lines 31–61):
```ts
const createJobSchema = z.object({
  addOnServiceIds: z.array(idSchema).max(20).default([]),
  assignedUserId: idSchema,
  couponCode: z.string().trim().max(40).optional(),
  customerId: idSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
  initialStatus: z.enum(["DRAFT", "WAITING", "IN_PROGRESS"]).default("WAITING"),
  location: z.object({...}).strict().refine(...),
  manualDiscountMinor: z.number().int().nonnegative().default(0),
  manualDiscountReason: z.string().trim().min(5).max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  photoAssetId: idSchema,
  primaryServiceId: idSchema,
  referralCode: z.string().trim().max(40).optional(),
  rewardAmountMinor: z.number().int().positive().optional(),
  rewardId: idSchema.optional(),
  vehicleId: idSchema,
}).strict();
```

Replace with:
```ts
const createJobSchema = z.object({
  addOnServiceIds: z.array(idSchema).max(20).default([]),
  assignedUserId: idSchema,
  customerId: idSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
  initialStatus: z.enum(["DRAFT", "WAITING", "IN_PROGRESS"]).default("WAITING"),
  location: /* existing location schema */,
  notes: z.string().trim().max(2000).optional(),
  photoAssetId: idSchema,
  primaryServiceId: idSchema,
  vehicleId: idSchema,
  ...benefitSelectionShape,
}).strict().superRefine(validateBenefitsInput);
```

Remove the old inline couponCode, referralCode, rewardAmountMinor, rewardId, manualDiscountMinor, manualDiscountReason definitions.

- [ ] **Step 3: Update wash-job INSERT to include `rounding_mode`**

The INSERT at line 603 must include the new column. Add `rounding_mode` to the column list and bind the resolved value. The route already resolves the rounding mode:

```ts
const rounding = stringSetting(settings, "billing.rounding_mode", "NONE") === "NEAREST_RUPEE"
  ? "NEAREST_RUPEE" : "NONE";
```

Add `rounding` to the INSERT bind list after `payment_status` and before `started_at`.

- [ ] **Step 4: Update reward reservation to set active columns**

At line 768, the `UPDATE referral_rewards ... 'RESERVED'` must now also set:

```sql
UPDATE referral_rewards SET
  status = 'RESERVED',
  reserved_for_wash_job_id = ?,
  active_reservation_transaction_id = ?,
  active_reservation_amount_minor = ?,
  remaining_amount_minor = remaining_amount_minor - ?,
  updated_at = ?, version = version + 1
WHERE id = ? AND status = 'AVAILABLE' AND version = ? AND remaining_amount_minor >= ?
```

The `active_reservation_transaction_id` is the ID of the `referral_reward_transactions` row being inserted in the same batch (step at line 778). Compute the transaction ID upfront:

```ts
const rewardTxnId = crypto.randomUUID();
```

Then use it in both the INSERT and the UPDATE.

- [ ] **Step 5: Add regression test**

Ensure existing New Wash creation tests still pass. Add a test asserting that a newly created job has `rounding_mode` populated.

```bash
pnpm --filter @washpro/api test -- wash-payments
```
Expected: pass.

- [ ] **Step 6: Typecheck API**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass.

---

### Task 5: Canonical applied-benefits read model

**Files:**
- Modify: `apps/api/src/routes/wash-jobs.ts` (GET /:id handler)
- Modify: `apps/web/src/pages/wash-job-detail.tsx` (JobDetail interface)

**Interfaces:**
- Consumes: wash-job detail endpoint (lines 814–852)
- Produces: `appliedBenefits` in the response, `applied_benefits` in JobDetail

- [ ] **Step 1: Extend `GET /wash-jobs/:id` response**

After the existing `Promise.all` for items, photos, locations (line 826), add a fourth query to load applied benefits. Add this to the `Promise.all`:

```ts
c.env.DB.prepare(
  `SELECT cr.id, cr.coupon_id, cr.coupon_code_snapshot AS code, cr.discount_amount_minor AS "discountMinor"
   FROM coupon_redemptions cr
   WHERE cr.wash_job_id = ? AND cr.status = 'RESERVED'`
).bind(c.req.param("id")).first<{ id: string; coupon_id: string; code: string; discountMinor: number } | null>(),

c.env.DB.prepare(
  `SELECT rr.id AS "redemptionId", rc.code,
          rr.friend_discount_minor AS "discountMinor"
   FROM referral_redemptions rr
   JOIN referral_codes rc ON rc.id = rr.referral_code_id
   WHERE rr.referred_wash_job_id = ? AND rr.status = 'PENDING'`
).bind(c.req.param("id")).first<{ redemptionId: string; code: string; discountMinor: number } | null>(),

c.env.DB.prepare(
  `SELECT rw.id, rw.active_reservation_amount_minor AS "amountMinor"
   FROM referral_rewards rw
   WHERE rw.reserved_for_wash_job_id = ? AND rw.status = 'RESERVED'`
).bind(c.req.param("id")).first<{ id: string; amountMinor: number } | null>(),
```

Then construct `appliedBenefits`:

```ts
const appliedBenefits = {
  coupon: couponRow ? { id: couponRow.coupon_id, code: couponRow.code, discountMinor: couponRow.discountMinor } : null,
  referral: referralRow ? { redemptionId: referralRow.redemptionId, code: referralRow.code, discountMinor: referralRow.discountMinor } : null,
  reward: rewardRow ? { id: rewardRow.id, amountMinor: rewardRow.amountMinor } : null,
  manualDiscount: job.manual_discount_minor > 0
    ? { amountMinor: job.manual_discount_minor, reason: job.manual_discount_reason ?? "" }
    : null,
};
```

Include `applied_benefits: appliedBenefits` in the response data alongside `items`, `photos`, `locations`.

**Note on camelCase**: The database queries return snake_case via column aliases; map to `appliedBenefits` (camelCase) in the response JSON.

- [ ] **Step 2: Update `JobDetail` interface in frontend**

In `apps/web/src/pages/wash-job-detail.tsx`, extend `JobDetail`:

```ts
interface JobDetail extends WashJobRecord {
  ...
  readonly applied_benefits: {
    readonly coupon: { readonly id: string; readonly code: string; readonly discountMinor: number } | null;
    readonly referral: { readonly redemptionId: string; readonly code: string; readonly discountMinor: number } | null;
    readonly reward: { readonly id: string; readonly amountMinor: number } | null;
    readonly manualDiscount: { readonly amountMinor: number; readonly reason: string } | null;
  } | null;
}
```

- [ ] **Step 3: Test via API test**

Add an API test that creates a job with coupon + referral + reward, then GETs the job and asserts `applied_benefits` is present and correct.

```bash
pnpm --filter @washpro/api test -- first-payment
```
Expected: pass.

---

### Task 6: Customer reward endpoint extension

**Files:**
- Modify: `apps/api/src/routes/customers.ts` (GET /:id/rewards, lines 363–398)

**Interfaces:**
- Consumes: existing rewards endpoint
- Produces: optional `washJobId` query param, returns the job's RESERVED reward when specified

- [ ] **Step 1: Add `washJobId` query parameter support**

Modify the GET `/:id/rewards` handler (line 363):

```ts
customerRoutes.get("/:id/rewards", requirePermission("wash_jobs.create"), async (c) => {
  const auth = c.get("auth");
  const washJobId = c.req.query("washJobId");
  // ... existing customer lookup ...

  const result = await c.env.DB.prepare(
    `SELECT id, original_amount_minor, remaining_amount_minor, available_from,
      expires_at, referral_redemption_id AS source_referral_redemption_id,
      version
     FROM referral_rewards
     WHERE organization_id = ? AND customer_id = ?
       AND remaining_amount_minor > 0
       AND (available_from IS NULL OR available_from <= ?)
       AND (expires_at IS NULL OR expires_at >= ?)
       AND (
         (status = 'AVAILABLE' AND reserved_for_wash_job_id IS NULL)
         OR (status = 'RESERVED' AND reserved_for_wash_job_id = ?)
       )
     ORDER BY COALESCE(expires_at, '9999-12-31T23:59:59.999Z'), created_at`,
  ).bind(
    auth.organizationId,
    c.req.param("id"),
    new Date().toISOString(),
    new Date().toISOString(),
    washJobId ?? null,  // null → never matches RESERVED, so only AVAILABLE returns
  ).all();

  return c.json({ data: result.results, success: true });
});
```

When `washJobId` is absent, `reserved_for_wash_job_id = NULL` never matches, so only AVAILABLE rewards return — backward compatible. When `washJobId` is present, the job's own RESERVED reward appears.

- [ ] **Step 2: Add tests**

Add API tests for:
- Without `washJobId`: returns only AVAILABLE rewards (existing behavior)
- With `washJobId`: also returns the job's RESERVED reward
- Never returns rewards reserved for another job
- Organization + customer scoping preserved

```bash
pnpm --filter @washpro/api test -- customers
```
Expected: pass.

---

### Task 7: Benefit preview endpoint

**Files:**
- Create: `apps/api/src/routes/benefit-preview.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/first-payment-benefits.test.ts`

**Interfaces:**
- Consumes: `washJobRoutes` in app.ts, `verifyBenefitsRequestSchema`, `AppliedBenefits`, existing `validateCoupon`, `validateReferral`, `calculateBill`
- Produces: `POST /api/v1/wash-jobs/:id/verify-benefits`

- [ ] **Step 1: Create `benefit-preview.ts` route file**

```ts
import { Hono } from "hono";
import { verifyBenefitsRequestSchema } from "@washpro/contracts";
import { calculateBill, normalizeCode, validateCoupon, validateReferral } from "@washpro/domain";
import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { booleanSetting, integerSetting, loadSettings, stringSetting } from "../services/settings";
import type { AppBindings } from "../types";

export const benefitPreviewRoutes = new Hono<AppBindings>();

benefitPreviewRoutes.post(
  "/:id/verify-benefits",
  requirePermission("payments.create"),
  async (c) => {
    const parsed = verifyBenefitsRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(422, "VALIDATION_ERROR", "Check the benefit details.", /* fields */);
    const auth = c.get("auth");

    // 1. Load wash job
    const job = await c.env.DB.prepare(
      `SELECT id, organization_id, branch_id, customer_id, vehicle_id, subtotal_minor,
        payment_status, paid_amount_minor, billing_locked_at, rounding_mode,
        tax_rate_basis_points, version
       FROM wash_jobs
       WHERE id = ? AND organization_id = ? AND branch_id = ?`
    ).bind(c.req.param("id"), auth.organizationId, auth.branchId).first<JobRow>();
    if (job === null) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");

    // 2. Benefit lock check
    if (job.billing_locked_at !== null || job.paid_amount_minor > 0 || job.payment_status === "PAID") {
      throw new ApiError(409, "BENEFITS_LOCKED", "Benefits cannot be changed after a payment has been recorded.");
    }

    // 3. Version check
    if (job.version !== parsed.data.expectedVersion) {
      throw new ApiError(409, "STALE_VERSION", "The job changed on another device.");
    }

    // 4. Rounding mode check
    if (job.rounding_mode === null) {
      throw new ApiError(422, "ROUNDING_MODE_UNKNOWN", "Legacy billing cannot be recalculated.");
    }

    // 5. Load job items (service IDs for eligibility)
    const items = await c.env.DB.prepare(
      "SELECT service_id, unit_price_minor FROM wash_job_items WHERE wash_job_id = ?"
    ).bind(job.id).all<{ service_id: string | null; unit_price_minor: number }>();
    const serviceIds = items.results.map(i => i.service_id).filter(Boolean) as string[];
    const itemsForBilling = items.results.map(i => ({ unitPriceMinor: i.unit_price_minor, quantity: 1 }));

    // 6. Load vehicle type for eligibility
    // (stored on vehicles referenced by wash_jobs.vehicle_id — query vehicle_type_id)

    // 7. Validate coupon (non-consuming — no mutation)
    // ...reuse wash-jobs.ts coupon validation pattern, but skip usage_count increment...

    // 8. Validate referral (non-consuming)
    // 9. Validate reward (non-consuming — check effective balance)
    // 10. Validate manual discount (capped at subtotal, reason required)
    // 11. Calculate revised bill
    // 12. Construct normalizedBenefits and appliedBenefits
    // 13. Return preview response
  }
);
```

**Key difference from commit path**: The preview validates identically but never inserts/updates any row. It calls `validateCoupon` and `validateReferral` with effective availability (excluding own reservations), and checks reward balance. No coupon_redemptions INSERT, no referral_redemptions INSERT, no referral_rewards UPDATE, no audit.

For effective availability:
- Coupon usage count: exclude own RESERVED redemption
- Referral already-used: exclude own PENDING redemption
- Reward balance: include currently reserved amount if replacing

- [ ] **Step 2: Mount in app.ts**

In `apps/api/src/app.ts`, after the wash-job routes line, add:

```ts
import { benefitPreviewRoutes } from "./routes/benefit-preview";
// ...
protectedApi.route("/wash-jobs", benefitPreviewRoutes);
```

Wait — `washJobRoutes` is already mounted at `/wash-jobs`. Each Hono instance supports one route per method+path. Since `benefitPreviewRoutes` defines `POST /:id/verify-benefits` and `washJobRoutes` has `POST /:id/start`, `POST /:id/pause`, etc., there's no conflict. But mounting two routers on the same base path can cause issues in Hono. Instead, add the route directly on `washJobRoutes` in `wash-jobs.ts`.

Better approach: add the route to the existing `washJobRoutes` in `wash-jobs.ts`:

```ts
// At bottom of wash-jobs.ts, before the export:
import { verifyBenefitsRequestSchema } from "@washpro/contracts";

washJobRoutes.post("/:id/verify-benefits", requirePermission("payments.create"), async (c) => {
  // preview implementation
});
```

- [ ] **Step 3: Add preview tests**

In `apps/api/test/first-payment-benefits.test.ts`:

```ts
describe("POST /wash-jobs/:id/verify-benefits", () => {
  it("valid replacement returns authoritative revised billing");
  it("preview performs no database mutations");
  it("existing reservations treated as effective availability");
  it("clearing all benefits previews with zero discount");
  it("invalid coupon returns COUPON_INVALID with field path");
  it("stale version returns 409");
  it("locked billing returns 409");
  it("unknown rounding mode returns 422");
  it("uses stored pricing snapshots, not current service prices");
});
```

---

### Task 8: Atomic combined payment operation

**Files:**
- Modify: `apps/api/src/routes/payments.ts` (POST / handler)
- Modify: `apps/api/src/services/audit.ts` (AuditInput.action typing)
- Modify: `apps/api/test/first-payment-benefits.test.ts`

**Interfaces:**
- Consumes: `paymentInputSchema` (extended), `auditStatement`, `derivePaymentSummary`, `calculateBill`, `validateCoupon`, `validateReferral`
- Produces: extended payment POST with benefits branch

This is the largest task. Break into steps:

- [ ] **Step 1: Add `sha256` import for canonical hashing**

At the top of `payments.ts`:

```ts
import { sha256 } from "../security/tokens";
```

- [ ] **Step 2: Build the `FinancialJob` interface extension**

Extend the existing `FinancialJob` interface at line 18 to include new columns:

```ts
interface FinancialJob {
  readonly balance_minor: number;
  readonly billing_locked_at: string | null;
  readonly branch_id: string;
  readonly coupon_discount_minor: number;
  readonly customer_id: string;
  readonly id: string;
  readonly manual_discount_minor: number;
  readonly manual_discount_reason: string | null;
  readonly organization_id: string;
  readonly paid_amount_minor: number;
  readonly payment_status: string;
  readonly referral_discount_minor: number;
  readonly refunded_amount_minor: number;
  readonly reward_discount_minor: number;
  readonly rounding_minor: number;
  readonly rounding_mode: string | null;
  readonly status: string;
  readonly subtotal_minor: number;
  readonly tax_minor: number;
  readonly tax_rate_basis_points: number | null;
  readonly total_amount_minor: number;
  readonly version: number;
}
```

- [ ] **Step 3: Implement pre-batch benefit comparison and validation**

After the existing job lookup (line 91), add a benefits branch:

```ts
const hasBenefits = isBenefitReplacementRequest(parsed.data.benefits);

if (hasBenefits) {
  // a. Verify version
  if (parsed.data.expectedVersion !== job.version) {
    throw new ApiError(409, "STALE_VERSION", "The job changed on another device.");
  }

  // b. Verify expectedVersion matches schema-level requirement
  // (already enforced by schema superRefine)

  // c. Load existing redemption rows
  const [existingCoupon, existingReferral, existingReward] = await Promise.all([
    c.env.DB.prepare("SELECT id, coupon_id, coupon_code_snapshot, discount_amount_minor, status FROM coupon_redemptions WHERE wash_job_id = ?")
      .bind(job.id).first<ExistingCoupon>(),
    c.env.DB.prepare("SELECT rr.id, rr.referral_code_id, rc.code, rr.friend_discount_minor, rr.status FROM referral_redemptions rr JOIN referral_codes rc ON rc.id = rr.referral_code_id WHERE rr.referred_wash_job_id = ?")
      .bind(job.id).first<ExistingReferral>(),
    c.env.DB.prepare("SELECT id, active_reservation_amount_minor, active_reservation_transaction_id, status, version FROM referral_rewards WHERE reserved_for_wash_job_id = ? AND status = 'RESERVED'")
      .bind(job.id).first<ExistingReward>(),
  ]);

  // d. Compare requested vs existing benefits (resolve canonical identities)
  // e. Determine what changed

  // f. Validate new benefits (effective availability — exclude own reservation)
  // g. Calculate revised bill via calculateBill()
  // h. Validate payment amount against revised balance

  // Build the guard and mutation statements (Steps 4-12)
}
```

- [ ] **Step 4: Build guard statements**

For each required guard, create a `D1PreparedStatement` using the pattern from the design doc (Section 9). Example for `WASH_JOB_UNLOCKED`:

```ts
const operationId = crypto.randomUUID();
const guardNow = new Date().toISOString();

statements.push(
  c.env.DB.prepare(
    `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at)
     VALUES (?, 'WASH_JOB_UNLOCKED',
       CASE WHEN EXISTS (
         SELECT 1 FROM wash_jobs WHERE id = ? AND organization_id = ?
           AND version = ? AND billing_locked_at IS NULL
           AND paid_amount_minor = 0 AND refunded_amount_minor = 0
           AND payment_status <> 'PAID'
           AND NOT EXISTS (
             SELECT 1 FROM payments
             WHERE wash_job_id = wash_jobs.id
               AND organization_id = wash_jobs.organization_id
               AND status = 'SUCCESS'
           )
       ) THEN 1 ELSE 0 END, ?)`
  ).bind(operationId, job.id, auth.organizationId, job.version, guardNow)
);
```

Repeat for ROUNDING_MODE_KNOWN, COUPON_OWNERSHIP, COUPON_RELEASABLE, COUPON_CAPACITY, REFERRAL_ELIGIBILITY, REWARD_RELEASABLE, REWARD_BALANCE — each conditional on whether that specific benefit is changing.

- [ ] **Step 5: Build release statements**

For each changed/removed benefit, add guarded release/pre-cleanup statements. Example for coupon release:

```ts
if (couponChanged && existingCoupon) {
  statements.push(
    c.env.DB.prepare("UPDATE coupons SET total_usage_count_cached = total_usage_count_cached - 1, updated_at = ? WHERE id = ? AND total_usage_count_cached > 0")
      .bind(now, existingCoupon.coupon_id),
    c.env.DB.prepare("UPDATE coupon_redemptions SET status = 'RELEASED', released_at = ? WHERE id = ? AND wash_job_id = ? AND status = 'RESERVED'")
      .bind(now, existingCoupon.id, job.id),
  );
}
```

- [ ] **Step 6: Build acquisition statements**

For each new/changed benefit. Example for new coupon:

```ts
if (newCouponId) {
  const crId = crypto.randomUUID();
  statements.push(
    c.env.DB.prepare(
      "INSERT INTO coupon_redemptions (id, coupon_id, customer_id, wash_job_id, status, original_amount_minor, discount_amount_minor, coupon_code_snapshot, discount_type_snapshot, discount_value_snapshot, reserved_at, created_by_user_id) VALUES (?, ?, ?, ?, 'RESERVED', ?, ?, ?, ?, ?, ?, ?)"
    ).bind(crId, newCouponId, job.customer_id, job.id, job.subtotal_minor, bill.couponDiscountMinor, newCouponCode, discountType, discountValue, now, auth.userId),
    c.env.DB.prepare("UPDATE coupons SET total_usage_count_cached = total_usage_count_cached + 1, updated_at = ?, version = version + 1 WHERE id = ?")
      .bind(now, newCouponId),
  );
}
```

- [ ] **Step 7: Build payment insertion (if total > 0)**

```ts
if (revisedTotal > 0) {
  const paymentId = crypto.randomUUID();
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO payments (id, organization_id, branch_id, wash_job_id, transaction_type, amount_minor, payment_method, status, external_transaction_reference, paid_at, received_by_user_id, notes, idempotency_key, created_at) VALUES (?, ?, ?, ?, 'PAYMENT', ?, ?, 'SUCCESS', ?, ?, ?, ?, ?, ?)`
    ).bind(paymentId, auth.organizationId, job.branch_id, job.id, parsed.data.amountMinor, parsed.data.method, parsed.data.transactionReference ?? null, now, auth.userId, parsed.data.notes ?? null, parsed.data.idempotencyKey, now),
  );
}
```

- [ ] **Step 8: Build consolidated wash-job UPDATE**

```ts
const paymentStatus = revisedTotal === 0 ? "PAID"
  : revisedTotal <= (parsed.data.amountMinor ?? 0) ? "PAID"
  : "PARTIALLY_PAID";

statements.push(
  c.env.DB.prepare(
    `UPDATE wash_jobs SET
       coupon_discount_minor = ?,
       referral_discount_minor = ?,
       reward_discount_minor = ?,
       manual_discount_minor = ?,
       manual_discount_reason = ?,
       total_discount_minor = ?,
       taxable_amount_minor = ?,
       tax_minor = ?,
       rounding_minor = ?,
       total_amount_minor = ?,
       paid_amount_minor = ?,
       balance_minor = ?,
       payment_status = ?,
       billing_locked_at = COALESCE(billing_locked_at, ?),
       updated_by_user_id = ?,
       updated_at = ?,
       version = version + 1
     WHERE id = ? AND organization_id = ? AND version = ?`
  ).bind(
    bill.couponDiscountMinor, bill.referralDiscountMinor, bill.rewardDiscountMinor,
    bill.manualDiscountMinor, parsed.data.benefits?.manualDiscountReason ?? null,
    bill.totalDiscountMinor, bill.taxableAmountMinor, bill.taxMinor, bill.roundingMinor,
    bill.totalAmountMinor,
    revisedTotal === 0 ? 0 : (existingPaid + parsed.data.amountMinor),
    revisedTotal === 0 ? 0 : (bill.totalAmountMinor - (existingPaid + parsed.data.amountMinor)),
    paymentStatus, now, auth.userId, now, job.id, auth.organizationId, job.version,
  )
);
```

- [ ] **Step 9: Build FINAL_JOB_UPDATE verification guard**

```ts
statements.push(
  c.env.DB.prepare(
    `INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at)
     VALUES (?, 'FINAL_JOB_UPDATE',
       CASE WHEN EXISTS (
         SELECT 1 FROM wash_jobs
         WHERE id = ? AND organization_id = ? AND version = ?
           AND billing_locked_at = ?
           AND total_amount_minor = ?
           AND paid_amount_minor = ?
           AND payment_status = ?
       ) THEN 1 ELSE 0 END, ?)`
  ).bind(operationId, job.id, auth.organizationId, job.version + 1, now,
    bill.totalAmountMinor, revisedTotal === 0 ? 0 : paidAfterUpdate, paymentStatus, now)
);
```

- [ ] **Step 10: Build referral qualification statements**

Same pattern as existing lines 161–242 in payments.ts, but use the effective referral redemption ID (newly inserted or unchanged existing).

- [ ] **Step 11: Build audit statements**

In order: release audits → application audits → payment/finalization. Example for coupon changed:

```ts
if (couponChanged) {
  if (existingCoupon) {
    statements.push(auditStatement(c.env, {
      action: "COUPON_RELEASED", auth,
      previous: { couponId: existingCoupon.coupon_id, code: existingCoupon.coupon_code_snapshot, discountMinor: existingCoupon.discount_amount_minor },
      recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO",
    }));
  }
  if (newCouponId) {
    statements.push(auditStatement(c.env, {
      action: "COUPON_APPLIED", auth,
      next: { couponId: newCouponId, code: newCouponCode, discountMinor: bill.couponDiscountMinor },
      recordId: job.id, recordType: "WASH_JOB", requestId: c.get("requestId"), severity: "INFO",
    }));
  }
}
```

If total > 0: `PAYMENT_RECORDED` audit.
If total === 0: `FULLY_DISCOUNTED_COMPLETION` audit.

- [ ] **Step 12: Build guard cleanup and idempotency completion**

```ts
statements.push(
  c.env.DB.prepare("DELETE FROM financial_operation_guards WHERE operation_id = ?").bind(operationId),
  c.env.DB.prepare(
    "UPDATE idempotency_keys SET state = 'COMPLETED', response_status = 201, response_body_json = ?, completed_at = ? WHERE id = ? AND state = 'PROCESSING'"
  ).bind(JSON.stringify(responseBody), now, idempotencyRecordId),
);
```

- [ ] **Step 13: Build idempotency INSERT**

At the start of the batch, insert the PROCESSING idempotency record:

```ts
const idempotencyRecordId = crypto.randomUUID();
const canonicalPayload = JSON.stringify(/* normalized parsed.data, sorted keys */);
const requestHash = await sha256(canonicalPayload);

statements.push(
  c.env.DB.prepare(
    `INSERT INTO idempotency_keys (id, organization_id, user_id, idempotency_key, operation_type, request_hash, resource_type, resource_id, state, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'FIRST_PAYMENT_WITH_BENEFITS', ?, 'WASH_JOB', ?, 'PROCESSING', ?, ?)`
  ).bind(idempotencyRecordId, auth.organizationId, auth.userId, parsed.data.idempotencyKey,
    requestHash, job.id, /* expiry: 24h from now */, now)
);
```

- [ ] **Step 14: Pre-batch idempotency replay check**

Before the batch, query for existing idempotency:

```ts
const replay = await c.env.DB.prepare(
  "SELECT * FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?"
).bind(auth.organizationId, parsed.data.idempotencyKey).first<IdempotencyRow>();

if (replay) {
  if (replay.state === 'COMPLETED' && replay.request_hash === requestHash) {
    return c.json(JSON.parse(replay.response_body_json!), replay.response_status!);
  }
  if (replay.request_hash !== requestHash) {
    throw new ApiError(409, "IDEMPOTENCY_MISMATCH", "Same key, different payload.");
  }
  throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Previous request still processing.");
}
```

- [ ] **Step 15: Error classification after batch failure**

Wrap the `DB.batch()` in try/catch. On error:
- Check for UNIQUE constraint on `idempotency_keys` → handle replay/mismatch
- Check for UNIQUE constraint on `payments.idempotency_key` → existing payment collision
- For all other errors (CHECK constraint from guards), re-read DB state and classify per precedence order (Section 17 of design doc)

- [ ] **Step 16: Payment-only path — preserve existing behavior + set billing_locked_at**

When `!hasBenefits`:
- Preserve existing idempotency check (payment-table-based)
- Preserve existing payment insertion
- Preserve existing wash-job UPDATE
- Add `billing_locked_at = COALESCE(billing_locked_at, ?)` to the existing wash-job UPDATE statement
- Set it only when this is the first payment (`existing paid === 0` → the COALESCE handles this)

- [ ] **Step 17: Build response for combined operation**

```ts
const response: CombinedPaymentResult = {
  payment: revisedTotal > 0 ? paymentRecord : null,
  revisedBilling: { ...bill, paymentStatus, version: job.version + 1, billingLockedAt: now },
  appliedBenefits: { coupon: /* */, referral: /* */, reward: /* */, manualDiscount: /* */ },
  fullyDiscounted: revisedTotal === 0,
};
```

Return HTTP 201.

- [ ] **Step 18: Add comprehensive tests**

In `apps/api/test/first-payment-benefits.test.ts`, add all categories from the design doc's Section 20 test matrix. Key groups:

Payment-only backward compat, first payment with benefits (atomically), partial first payment, zero-balance completion, benefit lock after payment, unchanged benefits preserved, single-benefit replacement, clearing all benefits, payment can't exceed revised balance, no zero-value payment, version increments once, stale version rollback, concurrent requests, idempotency replay/mismatch.

---

### Task 9: Payment-only lock update

**Files:**
- Modify: `apps/api/src/routes/payments.ts`

**Done as part of Task 8 Step 16.** The `billing_locked_at = COALESCE(billing_locked_at, ?)` is added to the existing payment-only wash-job UPDATE. No separate task needed — verified in Task 8 tests.

- [ ] **Step 1: Verify via existing tests**

```bash
pnpm --filter @washpro/api test -- wash-payments
```
Expected: pass. All existing payment tests still work. Add an assertion: after first payment without benefits, `billing_locked_at` is set.

---

### Task 10: Error handling and guard-failure classification

**Files:**
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/web/src/lib/api.ts` (ApiError.fields)

**Interfaces:**
- Consumes: D1 batch error, existing ApiError class
- Produces: `classifyGuardFailure()` function, ApiError.fields on frontend

- [ ] **Step 1: Implement `classifyGuardFailure` in payments.ts**

```ts
async function classifyGuardFailure(
  env: Env,
  jobId: string,
  orgId: string,
  expectedVersion: number,
  operationId: string,
  idempotencyKey: string,
  auth: AuthContext,
): Promise<ApiError> {
  // 1. Check idempotency collision
  const idem = await env.DB.prepare(
    "SELECT * FROM idempotency_keys WHERE organization_id = ? AND operation_type = 'FIRST_PAYMENT_WITH_BENEFITS' AND idempotency_key = ?"
  ).bind(orgId, idempotencyKey).first<IdempotencyRow>();
  if (idem) { /* handle replay/mismatch */ }

  // 2. Check payment collision
  const pmt = await env.DB.prepare(
    "SELECT * FROM payments WHERE organization_id = ? AND idempotency_key = ?"
  ).bind(orgId, idempotencyKey).first();
  if (pmt) { /* handle existing payment replay */ }

  // 3. Re-read job state
  const job = await env.DB.prepare(
    "SELECT * FROM wash_jobs WHERE id = ? AND organization_id = ?"
  ).bind(jobId, orgId).first<FinancialJob>();
  if (!job) return new ApiError(404, "RESOURCE_NOT_FOUND", "Wash job not found.");

  // 4-6. Check lock, version, rounding
  if (job.billing_locked_at !== null) return new ApiError(409, "BENEFITS_LOCKED", "...");
  if (job.version !== expectedVersion) return new ApiError(409, "STALE_VERSION", "...");
  if (job.rounding_mode === null) return new ApiError(422, "ROUNDING_MODE_UNKNOWN", "...");

  // 7-11. Check reservations, coupon, referral, reward state
  // ...

  // 12. Fallback
  return new ApiError(409, "FINANCIAL_STATE_CONFLICT", "The billing or benefit state changed. Refresh and try again.");
}
```

- [ ] **Step 2: Update frontend `ApiError` class**

In `apps/web/src/lib/api.ts`, add `fields` to the `ApiError` class:

```ts
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

In `apiFetch`, parse `body.error?.fields`:

```ts
throw new ApiError(
  response.status,
  body.error?.code ?? "REQUEST_FAILED",
  body.error?.message ?? "The request could not be completed.",
  (body.error as { fields?: Record<string, string> })?.fields,
);
```

---

### Task 11: Audit changes

**Files:**
- Modify: `apps/api/src/services/audit.ts` (AuditInput.action typing — optional, it's already `string`)
- No DB migration needed (audit_logs.action has no CHECK constraint)

**Done as part of Task 8 Step 11** — audit statements are built inside the payments route. No separate audit-table changes are needed. Verify that all 10 new action names render correctly in frontend audit label mapping during manual verification.

---

### Task 12: Exact frontend money parser and API client

**Files:**
- Modify: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: existing `money()` display helper
- Produces: `parseDecimalToMinor()`

- [ ] **Step 1: Add `parseDecimalToMinor`**

In `apps/web/src/lib/format.ts`:

```ts
export function parseDecimalToMinor(value: string): number {
  const clean = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error("Enter a valid amount with up to two decimal places.");
  }
  const parts = clean.split(".");
  const major = parseInt(parts[0]!, 10);
  const minor = parts.length === 2 ? parseInt(parts[1]!.padEnd(2, "0"), 10) : 0;
  if (major > Math.floor((Number.MAX_SAFE_INTEGER - minor) / 100)) {
    throw new Error("Amount is too large.");
  }
  return major * 100 + minor;
}
```

- [ ] **Step 2: Add tests**

```ts
describe("parseDecimalToMinor", () => {
  it("12.34 → 1234", () => expect(parseDecimalToMinor("12.34")).toBe(1234));
  it("12.3 → 1230", () => expect(parseDecimalToMinor("12.3")).toBe(1230));
  it("12 → 1200", () => expect(parseDecimalToMinor("12")).toBe(1200));
  it("0 → 0", () => expect(parseDecimalToMinor("0")).toBe(0));
  it("0.00 → 0", () => expect(parseDecimalToMinor("0.00")).toBe(0));
  it("00.50 → 50", () => expect(parseDecimalToMinor("00.50")).toBe(50));
  it("01.20 → 120", () => expect(parseDecimalToMinor("01.20")).toBe(120));
  it("rejects 3 decimal places", () => expect(() => parseDecimalToMinor("12.345")).toThrow());
  it("rejects negative", () => expect(() => parseDecimalToMinor("-5")).toThrow());
  it("rejects empty", () => expect(() => parseDecimalToMinor("")).toThrow());
  it("rejects letters", () => expect(() => parseDecimalToMinor("abc")).toThrow());
  it("rejects commas", () => expect(() => parseDecimalToMinor("1,234")).toThrow());
  it("rejects currency symbol", () => expect(() => parseDecimalToMinor("$12.34")).toThrow());
  it("rejects leading whitespace only", () => expect(() => parseDecimalToMinor("   ")).toThrow());
  it("accepts leading/trailing whitespace around digits", () => {
    expect(parseDecimalToMinor("  12.34  ")).toBe(1234);
  });
  it("rejects unsafe integer", () => {
    expect(() => parseDecimalToMinor("9007199254740992")).toThrow();
  });
});
```

```bash
pnpm --filter @washpro/web test -- format
```
Expected: pass.

---

### Task 13: PaymentDialog frontend implementation

**Files:**
- Modify: `apps/web/src/pages/wash-job-detail.tsx`
- Modify: `apps/web/src/pages/wash-job-detail.test.tsx`

**Interfaces:**
- Consumes: `PaymentDialog` component (lines 663–751), `JobDetail`, `WashJobRecord`, `useAuth`, `api`, `jsonBody`, `money`, `Button`, `Dialog`
- Produces: enhanced `PaymentDialog` with benefits section

This is a large frontend task. Break into sub-steps:

- [ ] **Step 1: Extend `JobDetail` and `WashJobRecord` types**

In `wash-job-detail.tsx`:

```ts
interface JobDetail extends WashJobRecord {
  readonly billing_locked_at?: string | null;
  readonly customer_id: string;
  readonly applied_benefits: {
    readonly coupon: { readonly id: string; readonly code: string; readonly discountMinor: number } | null;
    readonly referral: { readonly redemptionId: string; readonly code: string; readonly discountMinor: number } | null;
    readonly reward: { readonly id: string; readonly amountMinor: number } | null;
    readonly manualDiscount: { readonly amountMinor: number; readonly reason: string } | null;
  } | null;
  // ... existing fields
}
```

Also add `billing_locked_at` to `WashJobRecord` in `apps/web/src/types.ts`.

- [ ] **Step 2: Update `PaymentDialog` props**

```tsx
function PaymentDialog({
  record,
  onClose,
  onDone,
  open,
}: {
  readonly record: JobDetail;
  readonly onClose: () => void;
  readonly onDone: (result: { fullyDiscounted: boolean }) => void;
  readonly open: boolean;
})
```

- [ ] **Step 3: Derive `benefitsLocked`**

```tsx
const benefitsLocked = Boolean(record.billing_locked_at) ||
  record.paid_amount_minor > 0 ||
  record.payment_status === "PAID";
```

- [ ] **Step 4: Initialize benefit form state**

Use `initializedFor` ref to prevent re-initialization on re-renders:

```tsx
const initializedFor = useRef<string | null>(null);
const wasOpen = useRef(false);

useEffect(() => {
  const justOpened = open && !wasOpen.current;
  const differentJob = open && initializedFor.current !== null && initializedFor.current !== record.id;
  if ((justOpened || differentJob) && !benefitsLocked) {
    const ab = record.applied_benefits;
    setBenefitState({
      couponCode: ab?.coupon?.code ?? "",
      referralCode: ab?.referral?.code ?? "",
      rewardId: ab?.reward?.id ?? "",
      rewardAmount: ab?.reward?.amountMinor ? (ab.reward.amountMinor / 100).toString() : "",
      manualDiscount: ab?.manualDiscount?.amountMinor ? (ab.manualDiscount.amountMinor / 100).toString() : "0",
      manualDiscountReason: ab?.manualDiscount?.reason ?? "",
    });
    initializedFor.current = record.id;
  }
  if (!open) initializedFor.current = null;
  wasOpen.current = open;
}, [open, record.id, benefitsLocked]);
```

- [ ] **Step 5: Load rewards when editable**

```tsx
useEffect(() => {
  if (!open || benefitsLocked || !record.customer_id) return;
  const controller = new AbortController();
  (async () => {
    try {
      const result = await api<readonly RewardRow[]>(
        `/customers/${record.customer_id}/rewards?washJobId=${encodeURIComponent(record.id)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setRewards(result);
    } catch (e) {
      if (!controller.signal.aborted) setRewardsError(e instanceof Error ? e.message : "Failed");
    }
  })();
  return () => controller.abort();
}, [open, benefitsLocked, record.customer_id, record.id]);
```

Note: `api<T>()` needs `signal` support added in Task 12 (or extended here as the same time). Update the `api()` signature to pass `init.signal` through to `fetch`.

- [ ] **Step 6: Build "Verify benefits" handler**

```tsx
async function verifyBenefits() {
  setPreviewBusy(true);
  setPreviewError(null);
  setFieldErrors({});
  const requestSeq = ++previewSeq.current;
  try {
    const response = await api<VerifyBenefitsResponse>(
      `/wash-jobs/${record.id}/verify-benefits`,
      { ...jsonBody({ expectedVersion: record.version, benefits: desiredBenefits }), method: "POST", signal: abortController.signal },
    );
    if (requestSeq !== previewSeq.current) return;
    setPreview({
      response,
      expectedVersion: record.version,
      benefitFingerprint: currentFingerprint,
    });
    setPreviewDirty(false);
  } catch (e) {
    if (requestSeq !== previewSeq.current) return;
    if (e instanceof ApiError) {
      setPreviewError(e.message);
      if (e.fields) setFieldErrors(e.fields);
    } else {
      setPreviewError("Verification failed.");
    }
  } finally {
    if (requestSeq === previewSeq.current) setPreviewBusy(false);
  }
}
```

- [ ] **Step 7: Editable benefits section JSX**

Reuse New Wash wizard patterns (lines 496–619). Include: coupon code, referral code, reward dropdown, reward amount, manual discount + reason (behind permission check). Each with field-level error display.

- [ ] **Step 8: Read-only benefits section JSX**

Display canonical benefit details from `record.applied_benefits` with explanation text. All fields disabled.

- [ ] **Step 9: Current billing section**

Display: subtotal, existing discounts, tax, rounding, total, paid, balance. Conditionally show "Revised billing preview" after successful verification.

- [ ] **Step 10: Payment amount behavior**

Use `effectiveBalanceMinor = preview?.response.revised.balanceMinor ?? record.balance_minor`. Track `amountEdited`. On preview success: update default amount if not manually edited, clamp if exceeding revised balance.

- [ ] **Step 11: Zero-balance UX**

When `preview?.response.revised.totalAmountMinor === 0`:
- Hide payment method, reference, notes
- Show "These benefits fully cover the remaining bill..."
- Change button to "Apply benefits"
- `onDone({ fullyDiscounted: true })`

- [ ] **Step 12: Submit handler**

Build payload with or without benefits block. Reuse idempotency key for identical canonical payloads. Handle ApiError.fields.

- [ ] **Step 13: Parent component update**

```tsx
<PaymentDialog
  record={record}
  onClose={() => setPaymentOpen(false)}
  onDone={({ fullyDiscounted }) => {
    setPaymentOpen(false);
    toast.success(fullyDiscounted ? "Benefits applied — no payment required." : "Payment recorded.");
    job.reload();
    payments.reload();
  }}
  open={paymentOpen}
/>
```

- [ ] **Step 14: Add frontend tests**

In `wash-job-detail.test.tsx`, add all categories from Section 5.10 of the design doc. Mock `api` module. Test:
- Lock state derivation
- Canonical initialization
- Unchanged benefits omission
- Replacement on change
- Preview lifecycle
- Revised balance behavior
- Zero-balance UX
- Field error mapping
- Idempotency key reuse
- Read-only display
- Manual discount permission

---

### Task 14: Invoice and billing consistency

**Files:**
- Inspect: `apps/api/src/routes/invoices.ts` (invoice generation)

Check that the invoice reads billing columns from `wash_jobs` (already does — uses snapshots at generation time). Since we update `wash_jobs` billing columns atomically, and invoices are generated after payment, they read the authoritative columns. No code changes needed for positive payment.

For zero-balance: the invoice already shows `paid_minor` and `balance_minor` from wash_jobs. After zero-balance completion, these are 0 and PAID status. The invoice's `payment_method_summary` is a snapshot string — verify it does not claim a fake payment method when no payment exists. If it auto-generates a summary, add a check for `paid_minor === 0 && payment_status === 'PAID'` → show "Fully discounted" instead.

---

### Task 15: Final verification

- [ ] **Step 1: Full monorepo typecheck**

```bash
pnpm -r typecheck
```
Expected: pass.

- [ ] **Step 2: Full test suite**

```bash
pnpm -r test
```
Expected: all pass (including ~145 new tests).

- [ ] **Step 3: Full build**

```bash
pnpm -r build
```
Expected: pass.

- [ ] **Step 4: API dry-run**

```bash
pnpm --filter @washpro/api exec wrangler deploy --dry-run
```
Expected: pass.

- [ ] **Step 5: Git diff and status**

```bash
git diff --stat
git status --short
```

Expected: only modified/created files from this plan. No untracked artifacts.

- [ ] **Step 6: Do not commit, migrate, or deploy**

The feature is verified but not shipped.

---

### Dependency graph

```
Task 0 (Preflight)
  ↓
Task 1 (Contracts/schemas)
  ↓
Task 2 (Domain helpers)
  ↓
Task 3 (Migration 0016) ← can run in parallel with Task 4 after Task 2
  ↓
Task 4 (New Wash updates) ← depends on Task 1
  ↓
Task 5 (Applied benefits read model) ← depends on Task 3 columns
  ↓
Task 6 (Reward endpoint) ← depends on Task 3 columns
  ↓
Task 7 (Preview endpoint) ← depends on Tasks 1, 3, 5, 6
  ↓
Task 8 (Combined payment) ← depends on Tasks 1, 3, 7
  ↓
Task 9 (Payment lock) ← done inside Task 8
  ↓
Task 10 (Error handling) ← depends on Task 8
  ↓
Task 11 (Audit) ← done inside Task 8
  ↓
Task 12 (Money parser) ← independent, can run anytime after Task 0
  ↓
Task 13 (Frontend) ← depends on Tasks 5, 6, 7, 10, 12
  ↓
Task 14 (Invoice check) ← depends on Task 8
  ↓
Task 15 (Final verification) ← depends on all
```

### Files expected to be created

| File | Task |
|------|------|
| `apps/api/migrations/0016_billing_lock_and_benefits.sql` | 3 |
| `apps/api/test/first-payment-benefits.test.ts` | 7, 8 |

### Files expected to be modified

| File | Task |
|------|------|
| `packages/contracts/src/schemas.ts` | 1 |
| `packages/contracts/src/schemas.test.ts` | 1 |
| `packages/domain/src/billing.ts` | 2 |
| `packages/domain/src/billing.test.ts` | 2 |
| `apps/api/src/routes/wash-jobs.ts` | 4, 5, 7 |
| `apps/api/src/routes/payments.ts` | 8, 9, 10 |
| `apps/api/src/routes/customers.ts` | 6 |
| `apps/api/test/migrations.test.ts` | 3 |
| `apps/api/test/wash-payments.test.ts` | 4 |
| `apps/web/src/lib/format.ts` | 12 |
| `apps/web/src/lib/format.test.ts` | 12 |
| `apps/web/src/lib/api.ts` | 10, 12 |
| `apps/web/src/pages/wash-job-detail.tsx` | 5, 13 |
| `apps/web/src/pages/wash-job-detail.test.tsx` | 13 |
| `apps/web/src/types.ts` | 5 |

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-29-record-payment-benefits-and-rewards.md`.**
