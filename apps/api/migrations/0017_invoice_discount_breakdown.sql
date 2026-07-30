-- 0017: Add individual discount-breakdown columns to invoices table.
--
-- The existing invoices table has a single discount_minor column (combined total).
-- These new columns store the categorized breakdown so the invoice detail page,
-- PDF, and share messages can display each discount type separately.
--
-- The rounding_minor column already exists (migration 0006), so only discount
-- columns are added here.
--
-- WHY NO BACKFILL:
-- The tr_invoices_issued_no_update trigger (migration 0006) prevents UPDATE
-- on any invoice where invoice_status <> 'DRAFT'. Since virtually all existing
-- invoices are ISSUED or REVISED, a SQL UPDATE backfill would be aborted.
-- A controlled application-level backfill script could be written in future
-- if categorized historical data is needed. For now, old invoices fall back to
-- the generic combined "Discount" row via the read-time compatibility layer.

ALTER TABLE invoices ADD COLUMN coupon_discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN referral_discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN reward_discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN manual_discount_minor INTEGER NOT NULL DEFAULT 0;
