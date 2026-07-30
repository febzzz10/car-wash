# Design: Benefits & Rewards in Record Payment Dialog

**Date:** 2026-07-29
**Status:** Approved — awaiting implementation

## 1. Problem

The Record Payment dialog on the Wash Job Detail page (`wash-job-detail.tsx:663–751`) currently
accepts only `amountMinor`, `paymentMethod`, `transactionReference`, and `notes`. Benefits
(coupon, referral code, reward redemption, manual discount) can only be set during New Wash
creation. If a job is created without benefits and then completes, the Record Payment dialog
offers no way to apply coupon, referral, reward, or manual discounts before the first payment.

This forces a two-step workaround: cancel the job and recreate it with benefits — losing the
job reference, timer history, evidence, and audit trail.

## 2. Goals and non-goals

### Goals

- Add a Benefits & Rewards section to the existing Record Payment dialog.
- Reuse the New Wash wizard's coupon, referral, reward, and manual-discount schemas,
  validation, and domain logic.
- Apply benefits and record the first payment atomically in a single D1 transaction.
- Lock benefits permanently after the first successful payment.
- Support fully discounted completion (zero-balance) without inserting a zero-value payment.
- Preserve backward compatibility for all existing payment callers.

### Non-goals

- Editing benefits after a payment exists.
- Creating a new `pay-with-benefits` endpoint.
- Implementing signed nonces for preview-to-commit verification.
- Duplicating coupon, referral, or reward business logic.
- Deploying to production.

## 3. Existing New Wash benefit architecture

The New Wash wizard (`new-wash.tsx`, step 5 at lines 496–619) and the wash-job creation
route (`wash-jobs.ts:320–795`) already validate and reserve benefits:

| Step | Behavior |
|------|----------|
| Schema | `createJobSchema` accepts `couponCode`, `referralCode`, `rewardId`, `rewardAmountMinor`, `manualDiscountMinor`, `manualDiscountReason` at the top level |
| Coupon | Normalized code → `validateCoupon()` → `INSERT coupon_redemptions ... 'RESERVED'` + increment `total_usage_count_cached` |
| Referral | Normalized code → `validateReferral()` → `INSERT referral_redemptions ... 'PENDING'` |
| Reward | Validated by ID + customer → `UPDATE referral_rewards ... 'RESERVED'` + `INSERT referral_reward_transactions ... 'RESERVE'` |
| Manual discount | Capped at subtotal. Reason required for positive amounts. ADMIN or `payments.adjust` |
| Billing | `calculateBill()` with coupon/referral/reward/manual discounts applied in sequence, tax + rounding |
| Atomicity | Single `DB.batch()` with wash-job INSERT, item INSERTs, photo INSERT, coupon/referral/reward mutations, audit |
| Benefit reserve states | Coupon: RESERVED. Referral: PENDING. Reward: RESERVED |

The Record Payment benefits feature reuses all of this — validation functions, lifecycle
states, billing calculation, and atomic batch pattern.

## 4. Benefit-lock decision and accounting rationale

### The lock

Benefits are editable only when **no successful payment has ever been recorded and the
billing has not been finalized**. The lock condition:

- `billing_locked_at IS NOT NULL`, or
- `paid_amount_minor > 0` (any payment, cumulative and monotonic), or
- `payment_status = 'PAID'` (covers the fully discounted zero-payment case)

### Why lock at first payment

1. **Immutability of ledger**: Existing payment records are ledger entries. Changing
   `total_amount_minor` after a payment would invalidate the relationship between paid
   amount and total.
2. **Overpayment risk**: If `total_amount_minor` is reduced below `paid_amount_minor`
   after a payment, the balance becomes negative — an unsupported accounting state.
3. **Refund complexity**: Correcting this would require implicit refund logic, which
   belongs in the dedicated refund workflow, not benefit editing.
4. **Audit integrity**: Every change to billing after a payment would require reconstructing
   which portion of each payment was against which version of the bill.

Behavior when locked:

- Benefits section displayed in read-only mode showing canonical applied benefit details.
- Explanation: "Benefits and discounts cannot be changed after a payment has been recorded.
  This protects the existing payment history and prevents the paid amount from exceeding the
  revised bill total."
- Server returns 409 `BENEFITS_LOCKED` for direct API attempts.

## 5. Shared contracts and schema changes

### Extracted field shape (`packages/contracts/src/schemas.ts`)

```ts
const optionalBenefitCodeSchema = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const t = val.trim();
  return t.length === 0 ? undefined : t;
}, z.string().max(40).optional());

const benefitSelectionShape = {
  couponCode: optionalBenefitCodeSchema,
  referralCode: optionalBenefitCodeSchema,
  rewardId: identifierSchema.optional(),
  rewardAmountMinor: positiveMoneyMinorSchema.optional(),
  manualDiscountMinor: moneyMinorSchema.default(0),
  manualDiscountReason: z.string().trim().min(5).max(500).optional(),
};
```

### `benefitsInputSchema` — embedded in payment request

```ts
export const benefitsInputSchema = z.object({
  replaceExisting: z.literal(true),
  ...benefitSelectionShape,
}).strict().superRefine(validateBenefitsInput);
```

### `createJobSchema` — top-level benefit fields without `replaceExisting`

```ts
export const createJobSchema = z.object({
  addOnServiceIds: z.array(idSchema).max(20).default([]),
  assignedUserId: idSchema,
  customerId: idSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
  initialStatus: z.enum(["DRAFT","WAITING","IN_PROGRESS"]).default("WAITING"),
  location: locationSchema,
  notes: z.string().trim().max(2000).optional(),
  photoAssetId: idSchema,
  primaryServiceId: idSchema,
  vehicleId: idSchema,
  ...benefitSelectionShape,
}).strict().superRefine(validateBenefitsInput);
```

`validateBenefitsInput` is a shared refinements function enforcing:
- `rewardId` and `rewardAmountMinor` supplied together
- `manualDiscountReason` required when `manualDiscountMinor > 0`
- `manualDiscountReason` rejected when `manualDiscountMinor === 0`

### Extended `paymentInputSchema`

```ts
const paymentBaseSchema = z.object({
  washJobId: identifierSchema,
  method: paymentMethodSchema,
  transactionReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(16).max(128),
});

export const paymentInputSchema = paymentBaseSchema.extend({
  amountMinor: moneyMinorSchema,
  benefits: benefitsInputSchema.optional(),
  expectedVersion: z.number().int().positive().safe().optional(),
}).strict().superRefine((data, ctx) => {
  const hasBenefits = data.benefits?.replaceExisting === true;
  if (data.amountMinor === 0 && !hasBenefits) {
    ctx.addIssue({ code: "custom", message: "Payment amount must be positive.", path: ["amountMinor"] });
  }
  if (hasBenefits && data.expectedVersion === undefined) {
    ctx.addIssue({ code: "custom", message: "expectedVersion required.", path: ["expectedVersion"] });
  }
});
```

### Key rules

- `amountMinor` is nonnegative (`moneyMinorSchema`) — 0 allowed through schema when benefits present, route enforces zero only when authoritative balance is zero.
- `benefits` omitted → no benefit mutation (backward compat).
- `benefits.replaceExisting = true` → complete desired replacement.
- `replaceExisting = true` with empty values → explicitly clear all benefits.
- `expectedVersion` required when `replaceExisting = true`.
- Blank coupon/referral codes normalize to `undefined` via `.preprocess()`.
- Unknown top-level and nested fields rejected by `.strict()`.

### Exports

```ts
export type BenefitsInput = z.infer<typeof benefitsInputSchema>;
export function isBenefitReplacementRequest(b: BenefitsInput | undefined): b is BenefitsInput {
  return b?.replaceExisting === true;
}
```

## 6. Explicit replacement semantics

When meaningful benefits are submitted (`replaceExisting = true`), they represent the
**complete desired replacement** — not an additive change.

The route:

1. Reads existing coupon_redemption, referral_redemption, reward reservation, and
   billing columns.
2. Compares canonical identities (coupon ID, referral code ID, reward ID + amount,
   manual discount amount + reason) with requested values.
3. **Preserves unchanged** reservations — no mutation.
4. **Releases only changed/removed** reservations via guarded exact-row UPDATEs.
5. **Creates only newly requested** reservations.

Comparison uses database-resolved canonical identities, not raw user-entered codes.
Capitalization, whitespace, and code aliases cannot trigger false "changed" detection.

To clear all benefits, send:
```json
{ "replaceExisting": true, "manualDiscountMinor": 0 }
```

## 7. Preview endpoint design

`POST /api/v1/wash-jobs/:id/verify-benefits` — informational only, no consumption.

**Request:**
```ts
{ expectedVersion: number, benefits: BenefitsInput }
```

**Response:**
```ts
{
  original: { subtotalMinor, couponDiscountMinor, referralDiscountMinor,
    rewardDiscountMinor, manualDiscountMinor, totalDiscountMinor,
    taxableAmountMinor, taxMinor, roundingMinor, totalAmountMinor },
  requested: { couponDiscountMinor, referralDiscountMinor, rewardDiscountMinor,
    manualDiscountMinor },
  revised: { totalDiscountMinor, taxableAmountMinor, taxMinor, roundingMinor,
    totalAmountMinor, balanceMinor },
  applied: AppliedBenefits,
  normalizedBenefits: BenefitsInput  // for commit
}
```

- Protected by `requireSession` + `requirePermission("payments.create")`.
- Validates benefits identically to the commit path but consumes nothing.
- Returns field-level errors via standard 422 error envelope with `fields`.
- Preview is informational — the payment endpoint revalidates everything atomically.
- Existing-reservation-aware: treats job's own reservations as effective availability.
- Uses stored pricing snapshots (`subtotal_minor`, `wash_job_items` snapshots,
  `tax_rate_basis_points`, `rounding_mode`), never current service prices.

## 8. Extended payment endpoint contract

`POST /api/v1/payments/` — existing endpoint, extended with optional `benefits` and
`expectedVersion` fields.

### Backward compatibility

- Existing request and response contracts remain unchanged.
- Existing payment, refund, authorization, CSRF, and idempotency behavior remains unchanged.
- When `benefits` is omitted, the request shape, validation, D1 batch, audit, and response
  are identical to the current implementation.
- The only intentional new side effect on the payment-only path is: the consolidated
  wash-job UPDATE sets `billing_locked_at = COALESCE(billing_locked_at, NOW)` on the
  first successful payment. Subsequent partial payments preserve the original lock timestamp.
- Failed, PENDING, VOIDED, or rejected payment attempts do not lock billing.

| Scenario | Request | Behavior |
|----------|---------|----------|
| Payment only, no benefits | No `benefits` field | Existing behavior, plus billing_locked_at set on first payment |
| Benefits + positive payment | `benefits.replaceExisting: true` + `amountMinor > 0` | Benefits applied + payment recorded atomically |
| Benefits + zero payment | `benefits.replaceExisting: true` + `amountMinor: 0` | Benefits applied, no payment row, billing locked as PAID |

### API response naming convention

- JSON API responses use **camelCase**: `appliedBenefits`, `revisedBilling`, `billingLockedAt`,
  `fullyDiscounted`, `expectedVersion`.
- Database-backed fields exposed through `WashJobRecord` and `JobDetail` remain **snake_case**
  only where required for backward compatibility with existing page-level `record.*` access.
- The `JobDetail` interface maps `applied_benefits` (database) to `appliedBenefits`
  (typed property) explicitly. Do not rely on implicit conversion.

**Success response:**
```ts
type CombinedPaymentResult = {
  payment: PaymentRecord | null;
  revisedBilling: {
    subtotalMinor, couponDiscountMinor, referralDiscountMinor, rewardDiscountMinor,
    manualDiscountMinor, totalDiscountMinor, taxableAmountMinor, taxMinor,
    roundingMinor, totalAmountMinor, paidAmountMinor, balanceMinor,
    paymentStatus, version, billingLockedAt
  };
  appliedBenefits: AppliedBenefits;
  fullyDiscounted: boolean;
};
```

- Positive payment → `payment` populated, `fullyDiscounted: false`, HTTP 201.
- Zero-balance → `payment: null`, `fullyDiscounted: true`, HTTP 201.
- Payment-only path → existing response shape unchanged.
- Stored in `idempotency_keys.response_body_json` for replay.

## 9. Atomic D1 operation and failing guard mechanism

**Problem**: A guarded UPDATE that affects zero rows is a successful SQL statement in D1.
Post-batch `meta.changes` verification cannot roll back already-committed mutations.

**Solution**: New `financial_operation_guards` table. Every critical precondition becomes
an INSERT with `passed` gated by a CASE expression. If `passed = 0`, the `CHECK (passed = 1)`
constraint fails → SQL error → entire D1 batch rolls back.

```sql
CREATE TABLE financial_operation_guards (
  operation_id TEXT NOT NULL,
  guard_name TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation_id, guard_name)
);
```

**WASH_JOB_UNLOCKED guard:**
```sql
INSERT INTO financial_operation_guards (operation_id, guard_name, passed, created_at)
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
  ) THEN 1 ELSE 0 END, ?);
```

The `NOT EXISTS (SELECT 1 FROM payments ... status = 'SUCCESS')` sub-clause is
defence-in-depth against legacy or inconsistent rows where `paid_amount_minor` is
unexpectedly zero despite an existing successful payment.

**Other guards**: COUPON_CAPACITY, COUPON_OWNERSHIP, COUPON_RELEASABLE, REFERRAL_ELIGIBILITY,
REWARD_BALANCE, REWARD_RELEASABLE, ROUNDING_MODE_KNOWN, FINAL_JOB_UPDATE.

Every guarded financial UPDATE (coupon release, reward release, reward acquisition,
referral qualification, referral count increment, consolidated wash-job update) is followed
by a verification guard inside the batch. A 0-row UPDATE cannot leave committed side effects.

### Batch operation order

```
 1. INSERT idempotency_keys → PROCESSING
 2. INSERT guard 'WASH_JOB_UNLOCKED'
 3. INSERT guard 'ROUNDING_MODE_KNOWN'                     [if benefits]
 4. INSERT guard 'COUPON_OWNERSHIP'                        [if changing coupon]
 5. INSERT guard 'COUPON_RELEASABLE'                       [if releasing coupon]
 6. INSERT guard 'COUPON_CAPACITY'                         [if new coupon]
 7. INSERT guard 'REFERRAL_ELIGIBILITY'                    [if changing referral]
 8. INSERT guard 'REWARD_RELEASABLE'                       [if releasing reward]
 9. INSERT guard 'REWARD_BALANCE'                          [if changing reward]
10. UPDATE coupons → decrement usage_count                 [if releasing coupon]
11. UPDATE coupon_redemptions → RELEASED                   [if releasing coupon]
12. UPDATE referral_redemptions → CANCELLED                [if releasing referral]
13. UPDATE referral_rewards → AVAILABLE + INSERT RELEASE   [if releasing reward]
14. INSERT coupon_redemptions → RESERVED                   [if new coupon]
15. UPDATE coupons → increment usage_count                 [if new coupon]
16. INSERT referral_redemptions → PENDING                  [if new referral]
17. UPDATE referral_rewards → RESERVED + INSERT RESERVE    [if new reward]
18. INSERT payments                                        [if total > 0]
19. UPDATE wash_jobs → consolidated billing/lock/version   [ONE update]
20. INSERT guard 'FINAL_JOB_UPDATE'
21. Qualify effective referral → rewards                   [if PAID + COMPLETED]
22. Audit: release audits → application audits → payment/finalization
23. DELETE FROM financial_operation_guards WHERE operation_id = ?
24. UPDATE idempotency_keys → COMPLETED
```

Every guard step that fails produces a SQL CHECK constraint error → full batch rollback.
No mutations survive a failed guard.

## 10. Billing and rounding-mode snapshots

Billing recalculation uses only stored data:

- `subtotal_minor` from wash_jobs (created at job time)
- Service IDs from `wash_job_items` (for eligibility checks only)
- `vehicle_type_id` from the job's stored snapshot
- `tax_rate_basis_points` from wash_jobs (snapshotted at creation)
- `rounding_mode` from wash_jobs (new column, see migration)

**New column**: `rounding_mode TEXT CHECK (rounding_mode IS NULL OR rounding_mode IN ('NONE', 'NEAREST_RUPEE'))`

- Set explicitly for all new wash jobs from the `billing.rounding_mode` organization setting.
- Resolved by the server — not a client-controllable field.
- `NULL` for pre-migration rows where `rounding_minor = 0` (ambiguous).
- `'NEAREST_RUPEE'` for rows where `rounding_minor <> 0` (unambiguous).
- Benefit recalculation rejected for NULL-mode rows via `ROUNDING_MODE_KNOWN` guard.
- Current service prices are never used; changing the service catalogue after job creation
  has no effect on stored bills.

## 11. Coupon, referral and reward replacement lifecycle

Benefits follow the same lifecycle states as creation time:

| Benefit | State at creation | State after first-payment application |
|---------|------------------|--------------------------------------|
| Coupon | RESERVED | RESERVED (same) |
| Referral | PENDING | PENDING (same, may qualify in same batch if PAID + COMPLETED) |
| Reward | RESERVED | RESERVED (same) |

No new lifecycle transitions are introduced. The existing payment-route referral-qualification
logic (lines 161–242 of `payments.ts`) remains the sole owner of
PENDING → QUALIFIED → REWARD_ISSUED transitions.

### Replacement behavior

- **Unchanged coupon** → no mutation, no usage-count change
- **Replaced coupon** → old: RELEASED + usage_count--; new: RESERVED + usage_count++
- **Removed coupon** → RELEASED + usage_count--
- **Unchanged referral** → no mutation
- **Replaced referral** → old: CANCELLED; new: PENDING
- **Removed referral** → CANCELLED
- **Unchanged reward** → no mutation
- **Replaced reward** → old: AVAILABLE (balance restored from exact stored RESERVE amount); new: RESERVED
- **Removed reward** → AVAILABLE (balance restored)

All releases use exact guarded transitions on specific IDs and states. Coupon usage_count
decremented only when the redemption was actually RESERVED. Reward balance restored only
from the exact stored `active_reservation_amount_minor`.

### Exclusion of own reservation during validation

Before applying a new coupon, usage counts exclude the job's own RESERVED redemption.
Before applying a new referral, duplicate checks exclude the job's own PENDING redemption.
Effective reward balance includes the currently reserved amount when replacing.

## 12. Reward active-reservation tracking

**New columns** on `referral_rewards`:
```sql
ALTER TABLE referral_rewards
  ADD COLUMN active_reservation_transaction_id TEXT;
ALTER TABLE referral_rewards
  ADD COLUMN active_reservation_amount_minor INTEGER NOT NULL DEFAULT 0
  CHECK (active_reservation_amount_minor >= 0);
```

**Column invariants** (enforced by runtime guards):
- `active_reservation_transaction_id IS NULL` requires `active_reservation_amount_minor = 0`.
- `active_reservation_transaction_id IS NOT NULL` requires `active_reservation_amount_minor > 0`,
  `status = 'RESERVED'`, and `reserved_for_wash_job_id IS NOT NULL`.
- The transaction referenced by `active_reservation_transaction_id` must exist in
  `referral_reward_transactions` with `transaction_type = 'RESERVE'` and a matching
  `wash_job_id`.

The release verification guard enforces these invariants inside every batch that modifies
a reward reservation.

**Foreign-key reference**: Add a FK from `active_reservation_transaction_id` to
`referral_reward_transactions(id)` if the project's existing migration conventions
support it for D1. If not, document that ownership and transaction-type integrity
are enforced exclusively by in-batch guards.

Set at reservation time (New Wash creation and first-payment benefit application):
```sql
UPDATE referral_rewards SET status = 'RESERVED',
  active_reservation_transaction_id = ?,
  active_reservation_amount_minor = ?,
  ...
```

Cleared at release time. These columns provide the exact, deterministic link between a
RESERVED reward and its RESERVE transaction — eliminating ambiguous `ORDER BY created_at`
lookups.

**Backfill**: Only for rows where exactly one valid, active, unreleased RESERVE transaction
exists for the reserved wash job. The backfill must verify:

- `transaction_type = 'RESERVE'`
- `wash_job_id = reserved_for_wash_job_id`
- `amount_minor > 0`
- No matching RELEASE, REDEEM, EXPIRE, CANCEL, or ADMIN_ADJUSTMENT transaction for the
  same reward and wash job
- Active reservation fields not already populated

Ambiguous rows left unresolved (active columns NULL) and reported for manual review.

## 13. Idempotency behavior

The existing `idempotency_keys` table (migration 0001) anchors all combined operations
with `operation_type = 'FIRST_PAYMENT_WITH_BENEFITS'`.

Flow:
1. Pre-batch: query for existing idempotency record.
2. If found with same hash + COMPLETED → return stored status + body.
3. If found with different hash → 409 `IDEMPOTENCY_MISMATCH`.
4. INSERT INTO batch → unique constraint provides race protection.
5. On success → UPDATE to COMPLETED with response.
6. On failure → batch rollback removes the INSERT (no PROCESSING row persists).

Canonical hash inputs: Zod-parsed data, blank codes normalized, default values applied,
object keys sorted deterministically. Same semantic request → same hash.

Payment-only idempotency (UNIQUE on `payments.organization_id, payments.idempotency_key`)
remains unchanged.

Frontend idempotency: the dialog maintains a `lastAttempt` ref keyed by canonical payload.
Same payload retry → same key. Different payload → new key. Cleared on dialog close.

## 14. Fully discounted zero-payment flow

When the authoritative recalculation produces `totalAmountMinor === 0`:

- No payment row is inserted.
- The consolidated wash-job UPDATE sets: `totalAmountMinor = 0`, `paidAmountMinor = 0`,
  `balanceMinor = 0`, `paymentStatus = 'PAID'`, `billingLockedAt = now`.
- `method`, `transactionReference`, and `notes` sent by the client are ignored.
- Audit: `FULLY_DISCOUNTED_COMPLETION` — not `PAYMENT_RECORDED`.
- Response: `payment: null`, `fullyDiscounted: true`, HTTP 201.
- Idempotency record persists the full response for replay.

Frontend UX:
- Preview shows revised balance of 0.
- Payment amount, method, reference, and notes fields hidden.
- Message: "These benefits fully cover the remaining bill. No payment transaction will be created."
- Primary button label changes to "Apply benefits".
- Toast on success: "Benefits applied — no payment required."

## 15. Frontend PaymentDialog UX

### Props

Receives `record: JobDetail` (containing id, version, billing columns, `applied_benefits`,
`billing_locked_at`, `paid_amount_minor`, `payment_status`, `customer_id`).

### Benefit lock

```ts
const benefitsLocked = Boolean(record.billing_locked_at) ||
  record.paid_amount_minor > 0 || record.payment_status === "PAID";
```

### Editable mode (`!benefitsLocked`)

- Six benefit fields from `benefitSelectionShape` in a `BenefitFormState` (all strings for
  amounts, converted to minor units at comparison/submit time).
- Manual discount visible only when `user?.role === "ADMIN" || user?.permissions.includes("payments.adjust")`.
- "Verify benefits" button calls `POST /wash-jobs/:id/verify-benefits`.
- Preview displays "Current billing" + "Revised billing preview" sections.
- Revised balance drives payment amount default and max.
- Submit sends `benefits.replaceExisting: true` with `expectedVersion` only when benefits changed.
- Unchanged benefits omit the benefits block entirely.
- Field-level errors displayed beside corresponding inputs.

### Read-only mode (`benefitsLocked`)

- Canonical benefit details from `record.applied_benefits` displayed as text.
- All fields disabled.
- Explanation message shown.

### Initialization

Form initialized from `record.applied_benefits` only on dialog open or when a different job
is opened. Object identity changes during parent rerenders do not trigger reinitialization.
Record version changes preserve inputs but invalidate preview.

### State management

- `BenefitFormState` (string amounts)
- `amountEdited` flag (reset only on dialog open/close/success)
- `preview`, `previewBusy`, `previewError`, `previewDirty`, `fieldErrors`
- `VerifiedPreview { response, expectedVersion, benefitFingerprint }`
- `lastAttempt` ref for idempotency key reuse
- `initializedFor` ref for initialization guard
- AbortController for reward fetch and preview

### Money parsing

`parseDecimalToMinor(value: string): number` — exact minor-unit conversion:
- `"12.34"` → `1234`
- `"0"` → `0`
- Rejects: >2 decimal places, negative, empty, non-numeric, unsafe integers
- Used for payment amount, reward amount, manual discount amount

### Payment amount behavior

- Default: current `record.balance_minor`.
- After preview: if `!amountEdited`, set to revised balance.
- If `amountEdited` and amount ≤ revised balance: preserve.
- If amount > revised balance: clamp + inline warning.
- Zero-balance preview: hide all payment fields, button → "Apply benefits".

### Reward loading

Fetch: `GET /customers/:customerId/rewards?washJobId=:jobId` with AbortController.
Endpoint must include the job's own RESERVED reward. Loading/error states shown.

### Post-success

`onDone({ fullyDiscounted })` → parent shows appropriate toast, calls `job.reload()` +
`payments.reload()`. Dialog closes.

## 16. Permission and security controls

| Action | Permission |
|--------|-----------|
| Open Payment dialog | `payments.create` (existing) |
| View benefits (read-only) | Implicit — visible to anyone who can open the dialog |
| Apply coupon code | Implicit — validated server-side |
| Apply referral code | Implicit — validated server-side |
| Redeem reward | Implicit — must belong to wash job's customer |
| Apply manual discount | ADMIN role or `payments.adjust` permission |
| Preview benefits | `payments.create` |
| Record payment with benefits | `payments.create` |

CSRF protection: `x-csrf-token` header required (existing). Session auth via
`__Host-washpro_session` cookie (existing). `organization_id` scoping on all queries (existing).

## 17. Error codes and field mappings

### Error classification precedence

After catching a D1 batch error:
1. Idempotency collision → handle replay/mismatch
2. Payment collision → existing behavior
3. Job missing → 404
4. Billing locked → 409 `BENEFITS_LOCKED`
5. Stale version → 409 `STALE_VERSION`
6. Unknown rounding mode → 422 `ROUNDING_MODE_UNKNOWN`
7. Reservation ownership → 409 `RESERVATION_CONFLICT`
8. Coupon failure → 422 `COUPON_*`
9. Referral failure → 422 `REFERRAL_*`
10. Reward failure → 422/409 `REWARD_*`
11. Manual discount failure → 422/403 `MANUAL_DISCOUNT_*`
12. Unknown → 409 `FINANCIAL_STATE_CONFLICT`

### Field path mappings

| Error | `fields` path |
|-------|-------------|
| Coupon invalid/expired/limit | `benefits.couponCode` |
| Referral invalid/self/used | `benefits.referralCode` |
| Reward not found/unavailable | `benefits.rewardId` |
| Reward amount exceeded | `benefits.rewardAmountMinor` |
| Manual discount exceeds total | `benefits.manualDiscountMinor` |
| Manual discount reason required | `benefits.manualDiscountReason` |
| Manual discount forbidden | — (403, global) |
| Payment exceeds balance | `amountMinor` |
| Stale version | `expectedVersion` |
| Benefits locked | — (409, global) |

Global errors (no field path) use the form alert. Field errors display inline beside the
corresponding control.

## 18. Audit actions and ordering

### New audit actions

The `audit_logs.action` column (migration 0007) is `TEXT NOT NULL` with no CHECK constraint
on action values. Only `severity` has a CHECK constraint (`'INFO', 'WARNING', 'CRITICAL'`).

Therefore, no database migration is required for new audit action names. Only the following
require updates:

- **TypeScript audit service**: `apps/api/src/services/audit.ts` — the `AuditInput.action`
  field accepts any string, but a shared action enum or type union should be extended for
  type safety.
- **Contracts package**: If a shared audit-action enum exists, add the new values.
- **Frontend audit label mappings**: Update the audit-history display to render human-readable
  labels for the new actions.
- **Audit triggers**: The existing `tr_audit_no_sensitive_values` trigger (migration 0009)
  does not filter by action and continues to protect all audit rows.

| Action | When | Severity |
|--------|------|----------|
| `COUPON_APPLIED` | New or changed coupon | INFO |
| `COUPON_RELEASED` | Coupon removed or replaced | INFO |
| `REFERRAL_BENEFIT_APPLIED` | New or changed referral | INFO |
| `REFERRAL_BENEFIT_CANCELLED` | Referral removed or replaced | INFO |
| `REWARD_APPLIED` | New or changed reward reserved | INFO |
| `REWARD_RESERVATION_RELEASED` | Reward removed or replaced | INFO |
| `MANUAL_DISCOUNT_APPLIED` | Manual discount added (0→positive) | WARNING |
| `MANUAL_DISCOUNT_UPDATED` | Amount/reason changed | WARNING |
| `MANUAL_DISCOUNT_REMOVED` | Cleared (positive→0) | INFO |
| `FULLY_DISCOUNTED_COMPLETION` | Zero-balance finalization | INFO |

Existing: `PAYMENT_RECORDED` (unchanged), referral qualification audits (unchanged).

### Ordering

Release audits before application audits. Payment/finalization audit last. All within
the same D1 batch — guard failure rolls back audit records. Unchanged benefits produce
no benefit-specific audits. Audit metadata includes `requestId` and `financialOperationId`.

## 19. Database migration 0016

**Migration number confirmed**: The latest migration in `apps/api/migrations/` is
`0015_assigned_user_name_snapshot.sql`. `0016` is the next sequential number. Do not
overwrite or modify any existing migration file.

```sql
-- Column additions
ALTER TABLE wash_jobs ADD COLUMN billing_locked_at TEXT;
ALTER TABLE wash_jobs ADD COLUMN rounding_mode TEXT
  CHECK (rounding_mode IS NULL OR rounding_mode IN ('NONE', 'NEAREST_RUPEE'));

-- Guard table
CREATE TABLE financial_operation_guards (
  operation_id TEXT NOT NULL,
  guard_name TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed = 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation_id, guard_name)
);

-- Reward tracking
ALTER TABLE referral_rewards ADD COLUMN active_reservation_transaction_id TEXT;
ALTER TABLE referral_rewards ADD COLUMN active_reservation_amount_minor INTEGER NOT NULL DEFAULT 0
  CHECK (active_reservation_amount_minor >= 0);

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

The migration is safe: column additions with NULL (or NOT NULL DEFAULT 0) are non-destructive.
Backfill UPDATEs contain safe WHERE predicates and will not modify already-populated rows.
Wrangler migration tracking applies 0016 exactly once. The raw SQL must not be manually
rerun. Re-running `wrangler d1 migrations apply` reports no pending migrations.

### New Wash creation update

The wash-job creation route (lines 764–789 of wash-jobs.ts) must set
`active_reservation_transaction_id` and `active_reservation_amount_minor` on new
reward reservations. The creation INSERT for wash_jobs must include `rounding_mode`.

## 20. Automated test matrix

### Test files

| File | Package | Status |
|------|---------|--------|
| `packages/contracts/src/schemas.test.ts` | contracts | Extend |
| `packages/domain/src/billing.test.ts` | domain | Extend |
| `apps/api/test/first-payment-benefits.test.ts` | api | New |
| `apps/api/test/migrations.test.ts` | api | Extend |
| `apps/web/src/pages/wash-job-detail.test.tsx` | web | Extend |
| `apps/web/src/lib/format.test.ts` | web | Extend |

### Test categories and counts (expected)

| Category | Count |
|----------|-------|
| Contract schemas | ~12 |
| Money parsing | ~15 |
| Migration validation | ~15 |
| Preview endpoint | ~12 |
| Combined payment API | ~18 |
| Reservation & concurrency | ~14 |
| Idempotency | ~9 |
| Referral lifecycle | ~7 |
| Audit logging | ~13 |
| Frontend (PaymentDialog) | ~30 |
| **Total** | **~145** |

### Use valid fixture builders to prevent false positives

Test that `createJobSchema` rejects `replaceExisting`:
```ts
const valid = validCreateJobInput();
const result = createJobSchema.safeParse({ ...valid, replaceExisting: true });
expect(result.success).toBe(false);
```

Test specific issue paths:
```ts
const r1 = benefitsInputSchema.safeParse({ replaceExisting: true, rewardId: "abc", manualDiscountMinor: 0 });
expect(r1.error?.issues.some(i => i.path.includes("rewardAmountMinor"))).toBe(true);
```

Boundary money tests:
```ts
parseDecimalToMinor("00.50") === 50
parseDecimalToMinor("01.20") === 120
// Leading/trailing whitespace, ".50", "1.", commas, currency symbols per contract
```

### Concurrent request test

```ts
// Two requests with same version, different idempotency keys
const [res1, res2] = await Promise.allSettled([...]);
// Exactly one succeeds (201), the other gets 409 STALE_VERSION or FINANCIAL_STATE_CONFLICT
// Job version incremented once, coupon usage changed once, no guard rows remain
```

## 21. Manual verification checklist

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Job with no benefits → open payment dialog | Benefits editable |
| 2 | Job with reserved coupon → open dialog | Coupon code pre-filled |
| 3 | Change coupon + verify | Preview shows revised billing |
| 4 | Change referral | Old PENDING cancelled, new PENDING created |
| 5 | Change reward amount | Bounded by available balance |
| 6 | Apply manual discount | Reason validated, preview shows discount |
| 7 | Remove manual discount | Preview shows removal |
| 8 | Partial payment with benefits | Payment inserted, balance reduced |
| 9 | Benefits fully cover bill | Zero-balance UX, "Apply benefits" button, status → PAID |
| 10 | Reopen dialog on paid job | Benefits read-only, explanation shown |
| 11 | Network interrupted + retry | Same key reused, no duplicate entries |
| 12 | Two browsers submit concurrently | One succeeds, other gets conflict |
| 13 | Billing card after payment | All billing fields correct |
| 14 | Payment history | Correct amount, method, timestamp |
| 15 | Customer rewards | Reservation deducted from available balance |
| 16 | Referrals page | Count incremented, reward issued |
| 17 | Audit history | All events present, in order, correlated |
| 18 | Invoice for positive payment | Discounts and total match, payment reflected |
| 19 | Invoice for fully discounted | Total = 0, no payment line, PAID status, no fake payment method |

## 22. Rollout, migration and rollback plan

### Pre-deployment preparation

1. Export or back up the production D1 database before applying Migration 0016.
2. Confirmed migration number: `0016` is the next sequential migration (latest:
   `0015_assigned_user_name_snapshot.sql`). Do not overwrite or modify any existing
   migration file.

### Migration

1. Test migration 0016 against a disposable D1 database using `wrangler d1 migrations apply --local`.
2. Verify upgrade from the migration state produced by 0001–0015 (not just a hand-written schema).
3. Test a clean install applying all migrations from 0001 through 0016.
4. Run full API test suite against the migrated database.
5. Identify ambiguous reward rows and report for manual review.
6. Wrangler's migration tracking ensures 0016 is applied exactly once; re-running reports
   no pending migrations. The raw SQL file must not be manually rerun.

### Deployment sequence

1. Merge PR (do not deploy from this task).
2. Deploy migration: `wrangler d1 migrations apply washpro-dev --remote`.
3. Deploy API Worker: `pnpm run deploy:api`.
4. Deploy Web Worker: `pnpm run deploy:web`.
5. Do not deploy the web UI before the compatible API and migration are available.
6. Verify: login, create job with benefits, record payment, verify billing card, invoice, audit.

### Rollback

Migration 0016 is additive (new nullable columns, new table). It should normally remain in
place if the API or Web Worker is rolled back. The previous API version tolerates newly added
nullable columns and tables without modification.

**Rollback procedure**:

1. Roll back API and Web Worker deployments independently by redeploying their previous
   Worker versions.
2. The previous API version silently ignores `billing_locked_at`, `rounding_mode`, and the
   `financial_operation_guards` table — no runtime errors.
3. Do **not** attempt to `DROP COLUMN`, drop the guard table, or rewrite completed financial
   records during an emergency rollback.
4. Use a forward-fix migration for any database defects discovered after deployment.
5. If Migration 0016 itself fails partially during application: stop deployment, restore
   the tested database backup, and follow the documented D1 recovery procedure before retrying.

Benefits locked after first payment are immutable — no rollback of financial state is needed
beyond restoring the Worker versions.

## 23. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Guard failure leaves committed mutations | `financial_operation_guards` CHECK constraint produces SQL errors → auto-rollback |
| Stale version bypasses lock | `WASH_JOB_UNLOCKED` guard verifies version + billing state before any mutation |
| Fully discounted job re-editable | `billing_locked_at` set on zero-balance finalization; `payment_status = 'PAID'` included in lock |
| Coupon usage double-counted | Release guard verifies RESERVED status before decrement; acquisition guard excludes own reservation |
| Reward double-released | Active transaction ID + amount stored on reward row; exact-match release |
| Legacy rounding mode unknown | `ROUNDING_MODE_KNOWN` guard rejects recalculation; clear error returned |
| Race between preview and commit | Version guard in batch; preview fingerprint tied to version; stale preview detected |
| Network failure loses idempotency | Frontend reuses same key for identical canonical payloads |

## 24. Final acceptance criteria

- [ ] `pnpm install --frozen-lockfile` succeeds
- [ ] `pnpm -r typecheck` passes (all workspaces)
- [ ] `pnpm -r test` passes (all workspaces, zero failures)
- [ ] `pnpm -r build` succeeds
- [ ] `pnpm --filter @washpro/api exec wrangler deploy --dry-run` succeeds
- [ ] All ~145 new tests pass
- [ ] Existing payment-only behavior has zero regressions
- [ ] Financial operations are atomic (guard failure → full rollback verified by tests)
- [ ] Failed guards leave zero D1 mutations
- [ ] No KV, R2 or external side effects occur
- [ ] Benefits become immutable after first financial finalization
- [ ] Payment, billing card, invoice, rewards, and audit history agree
- [ ] No zero-value payment record is created
- [ ] No production migration or deployment has occurred
- [ ] Reward rows requiring manual review are identified and reported
