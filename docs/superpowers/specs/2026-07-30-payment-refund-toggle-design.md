# Payment Refund Toggle Design

**Date:** 2026-07-30
**Setting key:** `payment.allow_refunds`
**Default:** `false`

## Objective

Add an organization-level Admin setting to enable or disable payment refunds. When disabled, refund actions are unavailable in both the frontend and API. The setting is enforced server-side.

## Setting definition

| Property | Value |
|----------|-------|
| Key | `payment.allow_refunds` |
| Value type | `BOOLEAN` |
| Default | `false` |
| Missing-value behaviour | `false` (safe fallback) |
| Setting group | `business` (alongside `payment.default_method`) |
| Bootstrap default | Not seeded — relies on code-level `false` fallback to avoid enabling refunds for existing organizations |

## Settings group membership

The key belongs to the `business` group where `payment.default_method` already lives. The server-side allowlist and frontend `Set` are updated accordingly.

## Enforcement boundary

### Server-side (primary)
The single refund API endpoint `POST /payments/:id/refund` in `apps/api/src/routes/payments.ts` gets an additional check inserted after authentication and permission verification:

1. Authenticate session
2. Verify `payments.refund` permission (existing)
3. Load organization's `payment.allow_refunds` setting via `booleanSetting()` with `false` fallback
4. Reject with `403 REFUNDS_DISABLED` if `false`
5. Continue with all existing validations (amount, idempotency, concurrency, etc.)
6. Execute refund atomically
7. Record audit event

No separate refund service file exists — all logic is inline in the route handler. The check at the route boundary covers all refund paths (full, partial, payment-detail initiated, direct API calls, repeated requests).

### Frontend (secondary)
The Refund button in `apps/web/src/pages/payments.tsx` checks the setting before rendering. During settings loading, the button is hidden (prefers hiding over disabled to avoid assuming refunds are enabled while loading).

## Error response

When disabled:
- HTTP 403
- Code: `REFUNDS_DISABLED`
- Message: `Payment refunds are disabled in Business Settings.`
- Standard envelope: `{ success: false, error: { code, message, requestId } }`

The error code `REFUNDS_DISABLED` is added to the `ERROR_CODES` array in `packages/contracts/src/enums.ts`.

## Frontend changes

### Settings page (`apps/web/src/pages/settings.tsx`)
- Toggle added to the Business section, positioned after `payment.default_method`
- Label: "Allow payment refunds"
- Description: "Allow authorized administrators to refund eligible payments. When disabled, refund actions are hidden and refund API requests are blocked."
- Uses existing `toggle-row` pattern for boolean settings
- Saves via existing PATCH `/settings/business` flow
- Loading/error/success states use existing patterns (SkeletonRows, ErrorState, toast)

### Payments page (`apps/web/src/pages/payments.tsx`)
- Refund button hidden when `payment.allow_refunds` is `false`
- During settings loading, button is hidden (assumes disabled until confirmed)
- Refunded payments still show their correct status
- Payment details and historical refund records remain visible
- Action column does not render unnecessary empty cells when no actions are available

## Bootstrap and existing organizations

`payment.allow_refunds` is NOT seeded in the bootstrap defaults — it defaults to `false` via the `booleanSetting()` fallback. This means no database migration is required, and existing organizations automatically have refunds disabled.

If production needs refunds enabled, a one-time `wrangler d1 execute` command would be run per organization:
```sql
INSERT INTO business_settings (id, organization_id, setting_key, value_type, value_text, updated_at)
SELECT 'set-allow-refunds', id, 'payment.allow_refunds', 'BOOLEAN', 'true', datetime('now')
FROM organizations;
```

## Audit

When the setting changes via the PATCH settings endpoint, the existing `BUSINESS_SETTINGS_UPDATED` audit mechanism captures:
- Previous state (`false` → `true` or `true` → `false`)
- New state
- Acting administrator
- Timestamp

Existing `PAYMENT_REFUNDED` audit events remain unchanged.

## Existing rules preserved

All current refund eligibility rules remain unchanged:
- Successful payment status
- Already refunded amount ≤ refundable amount
- Payment ownership and organization isolation
- Wash-job billing lock
- Valid reason (min 5 chars)
- Idempotency key
- Optimistic version checking on wash_jobs
- Append-only refunds table
- DB trigger `tr_refunds_not_over_payment`

## Files changed

| File | Change |
|------|--------|
| `apps/api/src/routes/payments.ts` | Add setting check in refund handler; import `loadSettings`/`booleanSetting` |
| `apps/api/src/routes/settings.ts` | Add `payment.allow_refunds` to business-group allowlist |
| `apps/web/src/pages/payments.tsx` | Conditionally hide Refund button based on setting |
| `apps/web/src/pages/settings.tsx` | Add toggle UI for the setting |
| `packages/contracts/src/enums.ts` | Add `REFUNDS_DISABLED` error code |

## Tests

### Settings API
- Default is `false` when setting absent
- Admin can set `true`
- Admin can set `false` (back)
- Unauthorized user rejected
- CSRF enforced
- Invalid values rejected
- Setting change audited

### Refund API
- Refund succeeds when enabled + all rules pass
- Refund returns `REFUNDS_DISABLED` when disabled
- Missing setting treated as disabled
- Direct API cannot bypass
- No mutation occurs when disabled
- Existing eligibility checks still apply when enabled
- Concurrent protection still works
- Organization isolation enforced

### Frontend settings
- Toggle displays saved state
- Toggle can be enabled and saved
- Toggle can be disabled and saved
- Loading/error states handled
- No settings permission users cannot modify

### Payments page
- Refund hidden when disabled
- Refund visible for eligible payments when enabled
- Ineligible payments still don't show Refund
- Existing refunded payments render correctly
- No broken empty Action column
- API error shown if setting changes after dialog opens

## Verification

```bash
pnpm -r typecheck
pnpm -r test
pnpm run build:web
git diff --check
pnpm --filter @washpro/api exec wrangler deploy --dry-run
```

Do not deploy automatically.
