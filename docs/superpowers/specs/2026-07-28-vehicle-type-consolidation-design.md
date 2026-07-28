# Vehicle-Type Consolidation — Design Document

**Date:** 2026-07-28
**Status:** Review
**Author:** AI Agent

---

## 1. Summary

Consolidate the WashPro vehicle-type system from 9 categorical types (Bike, Hatchback, Sedan, SUV, MUV, Van, Pickup, Commercial Vehicle, Other) to 3 canonical types (Two Wheeler, Three Wheeler, Four Wheeler). Add a shared TypeScript enum in `packages/contracts`, an accessible icon-based selector on the frontend, a database migration to replace existing data, and enforce price-configuration requirements for wash-job creation.

---

## 2. Architecture Change

### Current
- 9 vehicle types seeded per-organization during bootstrap as rows in `vehicle_types`
- No shared enum or Zod enum — only the bootstrap array in `bootstrap.ts`
- Frontend uses native `<select>` populated from API response
- Backend validates only that `vehicleTypeId` exists in the org's `vehicle_types` table
- Pricing per vehicle type via `service_prices.vehicle_type_id` FK
- Wash-job creation falls back to `s.base_price_minor` when no `service_prices` row exists

### Target
- 3 vehicle types seeded per-organization with stable codes: `TWO_WHEELER`, `THREE_WHEELER`, `FOUR_WHEELER`
- Shared enum + type + Zod schema in `packages/contracts` derived from a single readonly tuple
- Frontend API uses `vehicleTypeCode` (not `vehicleTypeId`) in requests
- API resolves `vehicleTypeCode` → DB `vehicle_type_id` per organization at runtime
- Accessible icon-based custom listbox selector on frontend
- All display uses shared icon + label config from `apps/web/src/lib/vehicle-types.ts`
- Price-configuration enforcement: services without an active price for the vehicle type are rejected

---

## 3. Shared Contracts (`packages/contracts/src/`)

### Single canonical source — no string duplication

```typescript
// enums.ts
export const VEHICLE_TYPES = [
  "TWO_WHEELER",
  "THREE_WHEELER",
  "FOUR_WHEELER",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];
```

```typescript
// schemas.ts — derived from the same tuple, no string repetition
import { VEHICLE_TYPES } from "./enums";

export const vehicleTypeCodeSchema = z.enum(VEHICLE_TYPES);
```

### API contract
- **Frontend requests**: send `vehicleTypeCode: "TWO_WHEELER"` (not the DB UUID)
- **API validation**: validate code against `vehicleTypeCodeSchema`
- **API resolution**: look up the organization's `vehicle_type_id` by code at query time
- **API responses**: return `vehicleTypeCode` for type safety; `vehicleTypeId` only for internal DB relationships
- **Never hardcode**: no hardcoded DB UUIDs anywhere in code

---

## 4. Database Migration (`apps/api/migrations/0011_consolidate_vehicle_types.sql`)

### Complete FK dependency chain

Tables with direct FK → `vehicle_types(id)`:
1. `vehicles.vehicle_type_id` — ON DELETE RESTRICT
2. `service_prices.vehicle_type_id` — ON DELETE RESTRICT
3. `coupon_eligible_vehicle_types.vehicle_type_id` — ON DELETE RESTRICT

Tables with indirect FK through vehicles/wash-jobs:
4. `vehicle_photos.vehicle_id` → vehicles
5. `wash_jobs.vehicle_id` → vehicles
6. `wash_job_items.wash_job_id` → wash_jobs
7. `timer_events.wash_job_id` → wash_jobs
8. `timer_adjustments.wash_job_id` → wash_jobs
9. `location_captures.wash_job_id` → wash_jobs
10. `payments.wash_job_id` → wash_jobs
11. `refunds.payment_id` → payments, `refunds.wash_job_id` → wash_jobs
12. `invoices.wash_job_id` → wash_jobs
13. `invoice_items.invoice_id` → invoices
14. `coupon_redemptions.wash_job_id` → wash_jobs
15. `referral_redemptions.referred_wash_job_id` → wash_jobs
16. `referral_rewards.reserved_for_wash_job_id` → wash_jobs
17. `referral_reward_transactions.wash_job_id` → wash_jobs

### Tables with delete-prohibiting triggers

The following triggers block deletion and must be dropped before the migration and recreated after:
- `tr_timer_events_no_delete` (timer_events)
- `tr_timer_adjustments_no_delete` (timer_adjustments)
- `tr_invoices_no_delete` (invoices)
- `tr_invoice_items_no_update`, `tr_invoice_items_no_delete` (invoice_items)
- `tr_refunds_no_delete` (refunds)
- `tr_audit_logs_no_delete` (audit_logs) — if audit entries exist
- `tr_expenses_no_delete` (expenses) — if expense entries exist

### Migration execution order (wrapped in transaction)

```sql
-- Step 1: Drop restrictive triggers
DROP TRIGGER IF EXISTS tr_refunds_no_update;
DROP TRIGGER IF EXISTS tr_refunds_no_delete;
DROP TRIGGER IF EXISTS tr_invoices_no_delete;
DROP TRIGGER IF EXISTS tr_invoice_items_no_update;
DROP TRIGGER IF EXISTS tr_invoice_items_no_delete;
DROP TRIGGER IF EXISTS tr_timer_events_no_delete;
DROP TRIGGER IF EXISTS tr_timer_adjustments_no_delete;

-- Step 2: Delete deepest dependencies first
DELETE FROM referral_reward_transactions;
DELETE FROM referral_rewards;
DELETE FROM referral_redemptions;
DELETE FROM coupon_redemptions;
DELETE FROM timer_adjustments;
DELETE FROM timer_events;
DELETE FROM location_captures;
DELETE FROM vehicle_photos;
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM refunds;
DELETE FROM payments;
DELETE FROM wash_job_items;
DELETE FROM wash_jobs;
DELETE FROM coupon_eligible_vehicle_types;
DELETE FROM service_prices;
DELETE FROM vehicles;

-- Step 3: Delete old vehicle types per organization
DELETE FROM vehicle_types;

-- Step 4: Insert 3 canonical vehicle types per organization
INSERT INTO vehicle_types (id, organization_id, code, name, display_order, created_at, updated_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    o.id, 'TWO_WHEELER', 'Two Wheeler', 0, datetime('now'), datetime('now')
  FROM organizations o
  UNION ALL
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    o.id, 'THREE_WHEELER', 'Three Wheeler', 1, datetime('now'), datetime('now')
  FROM organizations o
  UNION ALL
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(3))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    o.id, 'FOUR_WHEELER', 'Four Wheeler', 2, datetime('now'), datetime('now')
  FROM organizations o;

-- Step 5: Ensure composite uniqueness
-- (Already exists from 0002: UNIQUE (organization_id, code), but recreate for clarity)
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_types_org_code
  ON vehicle_types (organization_id, code);

-- Step 6: Recreate dropped triggers
CREATE TRIGGER tr_invoices_no_delete
  BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices are immutable');
END;
CREATE TRIGGER tr_invoice_items_no_update
  BEFORE UPDATE ON invoice_items
BEGIN
  SELECT RAISE(ABORT, 'invoice items are immutable');
END;
CREATE TRIGGER tr_invoice_items_no_delete
  BEFORE DELETE ON invoice_items
BEGIN
  SELECT RAISE(ABORT, 'invoice items are immutable');
END;
CREATE TRIGGER tr_timer_events_no_delete
  BEFORE DELETE ON timer_events
BEGIN
  SELECT RAISE(ABORT, 'timer events are append-only');
END;
CREATE TRIGGER tr_timer_adjustments_no_delete
  BEFORE DELETE ON timer_adjustments
BEGIN
  SELECT RAISE(ABORT, 'timer adjustments are append-only');
END;
CREATE TRIGGER tr_refunds_no_update
  BEFORE UPDATE ON refunds
BEGIN
  SELECT RAISE(ABORT, 'refunds are append-only');
END;
CREATE TRIGGER tr_refunds_no_delete
  BEFORE DELETE ON refunds
BEGIN
  SELECT RAISE(ABORT, 'refunds are append-only');
END;
```

### Migration verification queries (run after migration)
```sql
-- No FK violations
PRAGMA foreign_key_check;

-- Every organization has exactly 3 types
SELECT id, COUNT(*) AS type_count FROM organizations
  INNER JOIN vehicle_types ON vehicle_types.organization_id = organizations.id
  GROUP BY organizations.id HAVING COUNT(*) <> 3;

-- No old codes remain
SELECT code FROM vehicle_types WHERE code NOT IN ('TWO_WHEELER', 'THREE_WHEELER', 'FOUR_WHEELER');

-- No orphaned references
SELECT COUNT(*) FROM vehicles WHERE vehicle_type_id NOT IN (SELECT id FROM vehicle_types);
SELECT COUNT(*) FROM service_prices WHERE vehicle_type_id NOT IN (SELECT id FROM vehicle_types);
SELECT COUNT(*) FROM coupon_eligible_vehicle_types WHERE vehicle_type_id NOT IN (SELECT id FROM vehicle_types);
```

---

## 5. Bootstrap (`apps/api/src/routes/bootstrap.ts`)

Change seed array from 9 entries to 3, using the shared enum codes:

```typescript
import { VEHICLE_TYPES } from "@washpro/contracts";

const vehicleTypes: Array<[string, string]> = [
  ["TWO_WHEELER", "Two Wheeler"],
  ["THREE_WHEELER", "Three Wheeler"],
  ["FOUR_WHEELER", "Four Wheeler"],
] as const;
```

Bootstrap still handles idempotency via `INSERT OR IGNORE` due to the `UNIQUE (organization_id, code)` constraint.

---

## 6. API Changes

### `routes/vehicles.ts`

- **POST /**: Accept `vehicleTypeCode` in request body, validate against `vehicleTypeCodeSchema`, resolve to DB ID via lookup:
  ```sql
  SELECT id FROM vehicle_types WHERE organization_id = ? AND code = ? AND is_active = 1
  ```
  Return validation error if code not found for the org.
- **Response**: Include both `vehicle_type_id` (for DB FK) and `vehicle_type_code` (for frontend type safety)
- **GET /, GET /:id**: Return `vehicle_type_code` alongside `vehicle_type_name`

### `routes/services.ts`

- Return vehicle types with both `id` and `code` from the shared enum
- Service pricing display uses the 3 canonical codes

### `routes/coupons.ts`

- Eligible vehicle type selection uses codes instead of raw IDs
- Validate codes against `vehicleTypeCodeSchema`
- Resolve to DB IDs for storage in `coupon_eligible_vehicle_types`

### `routes/wash-jobs.ts` — Price-configuration enforcement

Current behavior (must change):
```sql
COALESCE(sp.price_minor, s.base_price_minor) AS price_minor
```
Falls back to `base_price_minor` when no `service_prices` row exists.

New behavior:
Remove the `COALESCE` fallback. The query must only return services with an active price for the vehicle type:
- Change `LEFT JOIN service_prices` to require `sp.id IS NOT NULL` (effectively INNER JOIN)
- If a service has no active price for the vehicle type, it won't be returned
- The existing check (line 282-291) will reject with `SERVICE_NOT_AVAILABLE`

The error message will become: *"Price is not configured for this vehicle type."* (changed from generic "unavailable" for the missing-price case).

### `routes/invoices.ts`

- Invoice display continues to use snapshot text (no change needed — `vehicle_type_snapshot` is already plain text)

---

## 7. Frontend Changes

### New source of truth: `apps/web/src/lib/vehicle-types.ts`

```typescript
import { VEHICLE_TYPES, type VehicleType } from "@washpro/contracts";
import { Motorcycle, Car } from "lucide-react";
import type { ComponentType } from "react";
import AutoRickshaw from "@/components/auto-icon";

export interface VehicleTypeOption {
  value: VehicleType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

export const VEHICLE_TYPE_OPTIONS: readonly VehicleTypeOption[] = [
  { value: "TWO_WHEELER", label: "Two Wheeler", icon: Motorcycle },
  { value: "THREE_WHEELER", label: "Three Wheeler", icon: AutoRickshaw },
  { value: "FOUR_WHEELER", label: "Four Wheeler", icon: Car },
] as const;
```

Every component that displays or selects vehicle types imports from this single file.

### New components

#### `components/auto-icon.tsx`

Custom inline SVG for the Three Wheeler (auto-rickshaw):
- 24×24 viewBox (matching Lucide conventions)
- `strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`
- Props: `size?: number` (default 24), `className?: string`, `aria-hidden?: boolean`
- Simple outline: three wheels, open sides, canopy roof, handlebar

#### `components/vehicle-type-select.tsx`

Accessible custom listbox:

**Trigger (closed state):**
- Shows selected vehicle type icon + label (or placeholder text if nothing selected)
- `role="combobox"` with `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`
- Visible focus ring matching existing WashPro input styles
- Disabled state support

**Dropdown (open state):**
- `role="listbox"` with unique `id` generated per instance
- Three options, each `<div role="option">` with `aria-selected`
- Each option shows the icon + label
- Same width, border-radius, typography as existing inputs

**Keyboard:**
- `ArrowUp` / `ArrowDown`: move focus between options
- `Home`: go to first option
- `End`: go to last option
- `Enter` / `Space`: select the focused option and close
- `Escape`: close without selecting, return focus to trigger
- `Tab`: close without trapping focus, move to next focusable element
- `aria-activedescendant` on the trigger (the element with keyboard focus)

**Mouse:**
- Click trigger: toggle dropdown
- Click option: select and close
- Click outside: close without selecting

**States:**
- Default (nothing selected, placeholder visible)
- Selected (icon + label visible in closed state)
- Disabled (greyed out, non-interactive)
- Validation error (red border + error message below)
- Loading (show spinner/greyed while API call in-flight)

**Screen-reader:**
- Trigger has `aria-label="Vehicle type"` and announces selected value
- Dropdown has `aria-label="Select vehicle type"`
- Selected option has `aria-selected="true"`
- Error state linked via `aria-describedby` or `aria-errormessage`

### Pages updated

| Page | File | Change |
|------|------|--------|
| New wash | `pages/new-wash.tsx` | Replace `<select>` with `VehicleTypeSelect` in NewVehicleDialog |
| Vehicle detail | `pages/vehicle-detail.tsx` | Replace `<select>` with `VehicleTypeSelect` in VehicleEditDialog |
| Vehicles list | `pages/vehicles.tsx` | Display vehicle type name with icon |
| Customer detail | `pages/customer-detail.tsx` | Display vehicle type name with icon |
| Services | `pages/services.tsx` | Use shared `VEHICLE_TYPE_OPTIONS` for price rows |
| Coupons | `pages/coupons.tsx` | Use shared `VEHICLE_TYPE_OPTIONS` for checkbox labels |

### API request change

All vehicle creation/update requests change from:
```json
{ "vehicleTypeId": "db-uuid-here" }
```
to:
```json
{ "vehicleTypeCode": "TWO_WHEELER" }
```

---

## 8. Icon Mapping

| Vehicle Type | Icon | Source | Design |
|-------------|------|--------|--------|
| TWO_WHEELER | `<Motorcycle size={20} />` | `lucide-react` | Standard Lucide motorcycle |
| THREE_WHEELER | `<AutoRickshaw size={20} />` | Custom inline SVG | Auto-rickshaw outline, 3 wheels, canopy, open sides, same stroke style as Lucide |
| FOUR_WHEELER | `<Car size={20} />` | `lucide-react` | Standard Lucide car |

Custom SVG: `apps/web/src/components/auto-icon.tsx`. ViewBox 0 0 24 24. strokeWidth=2. Uses `currentColor`. Matches Lucide stroke style precisely. Reusable with `size` and `className`. aria-hidden when accompanied by text.

---

## 9. Form Validation

- **Required**: Cannot submit without a selection
- **Invalid codes**: `vehicleTypeCode` validated against shared Zod enum on both client and server
- **Organization mismatch**: code must belong to the requesting organization's vehicle types
- **Error display**: Inline error below selector: "Select a vehicle type."
- **Error clearing**: Clears when a valid option is selected
- **Duplicate prevention**: Submit button disabled while request is in-flight
- **Registration-number validation**: unchanged

---

## 10. Price-Configuration Enforcement

This is a **new business-logic change** (not previously implemented).

### Current behavior
In `apps/api/src/routes/wash-jobs.ts`, the price query uses:
```sql
COALESCE(sp.price_minor, s.base_price_minor) AS price_minor
```
When no `service_prices` row exists for a vehicle type, it silently falls back to the service's `base_price_minor`.

### New behavior
1. Remove the `COALESCE` fallback — services must have an active `service_prices` row for the vehicle type.
2. Change the query to use `INNER JOIN` or equivalently require `sp.id IS NOT NULL`:
   ```sql
   FROM services s
   INNER JOIN service_prices sp ON sp.service_id = s.id
     AND sp.vehicle_type_id = ? AND sp.is_active = 1 AND sp.effective_to IS NULL
   ```
3. If no price exists, the service is omitted from results.
4. The existing missing-service check will reject with: *"Price is not configured for this vehicle type."*
5. After the migration (0 prices), the admin must configure prices via the Services & Pricing page before any service can be used.

### Test coverage
- Service without a price for the vehicle type → rejected
- Service with a configured price → accepted
- Clear user-facing error message
- No invalid wash-job submission is possible

---

## 11. Tests

### Updated fixtures
| File | Change |
|------|--------|
| `apps/api/test/bootstrap.test.ts` | Expect 3 types (was 9) |
| `apps/api/test/customers-vehicles.test.ts` | Use TWO_WHEELER code |
| `apps/api/test/wash-payments.test.ts` | Use FOUR_WHEELER code |
| `apps/api/test/invoices.test.ts` | Use FOUR_WHEELER code |
| `apps/api/test/promotions-admin.test.ts` | Use canonical codes |
| `apps/api/test/customer-history-pagination.test.ts` | Use canonical codes |
| `apps/api/test/migrations.test.ts` | List updated table set |
| `packages/domain/src/coupons.test.ts` | Use canonical codes |
| `packages/domain/src/referrals.test.ts` | Use canonical codes |
| `e2e/washpro.spec.ts` | Use 3 types only |

### New frontend tests (`apps/web/src/test/`)
- VehicleTypeSelect renders 3 options in correct order
- Each option has the correct icon and accessible label
- Each option shows the correct label text
- Keyboard navigation: ArrowUp, ArrowDown, Home, End, Enter, Space, Escape
- Click outside closes dropdown
- Validation: empty value shows error message
- Validation: valid selection clears error
- Duplicate submission prevention
- Disabled state

### New API tests
- `vehicleTypeCode` validation (accepts 3 codes, rejects legacy codes)
- Code-to-ID resolution per organization
- Cross-organization isolation (org A's code not valid for org B)
- Bootstrap idempotency (re-running doesn't create duplicates)
- Price-configuration enforcement (missing price → rejected)
- Migration integrity tests:
  - `PRAGMA foreign_key_check` returns no violations
  - Every organization has exactly 3 types
  - No old codes remain

---

## 12. Scope Boundaries

### In scope
- 3 vehicle type codes and labels
- Shared enum + type + Zod schema in contracts
- API migration from `vehicleTypeId` to `vehicleTypeCode`
- Accessible icon selector component
- Custom Three Wheeler inline SVG
- DB migration (delete test data, replace types)
- Bootstrap update (3 types)
- Price-configuration enforcement in wash-job creation
- All frontend display consistency
- Test updates and new tests

### Out of scope
- No UI change to coupons page vehicle type checkboxes (keep checkbox grid, just update labels/icons)
- No production migration execution
- No production deployment
- No changes to Cloudflare infrastructure, auth, or security
- No changes to invoice, payment, timer, or audit logic (those use snapshots)
