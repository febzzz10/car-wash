-- Migration 0018: Expand canonical payment methods to CASH, UPI, BANK_UPI, PAYTM
-- The payments.payment_method CHECK constraint cannot be altered in SQLite, so
-- the table is rebuilt in place. All rows are preserved; dependent objects
-- (indexes, triggers, views) are recreated.
-- Legacy values (CARD, BANK_TRANSFER, OTHER) remain readable and are retained
-- in the CHECK so historical records and imports are never rejected. New
-- payments are restricted to the four canonical values by the API contract.

-- workerd SQLite reparses surviving schema objects that reference the rebuilt
-- table when it is renamed; the refunds trigger must be dropped and recreated.
PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS v_job_payment_totals;
DROP VIEW IF EXISTS v_daily_financials;
DROP TRIGGER IF EXISTS tr_refunds_not_over_payment;

CREATE TABLE payments_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  wash_job_id TEXT NOT NULL,
  payment_reference TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'PAYMENT' CHECK (transaction_type IN ('PAYMENT', 'ADJUSTMENT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'BANK_UPI', 'PAYTM', 'CARD', 'BANK_TRANSFER', 'OTHER')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  external_transaction_reference TEXT,
  paid_at TEXT,
  received_by_user_id TEXT NOT NULL,
  notes TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (received_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (organization_id, idempotency_key)
);

INSERT INTO payments_new (
  id, organization_id, branch_id, wash_job_id, payment_reference, transaction_type,
  amount_minor, payment_method, status, external_transaction_reference, paid_at,
  received_by_user_id, notes, idempotency_key, created_at
)
SELECT
  id, organization_id, branch_id, wash_job_id, payment_reference, transaction_type,
  amount_minor, payment_method, status, external_transaction_reference, paid_at,
  received_by_user_id, notes, idempotency_key, created_at
FROM payments;

DROP TABLE payments;

ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX ix_payments_job ON payments (wash_job_id, status, paid_at);
CREATE INDEX ix_payments_date_method ON payments (branch_id, paid_at DESC, payment_method);

CREATE TRIGGER tr_payments_no_update
  BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments are append-only');
END;

CREATE TRIGGER tr_payments_no_delete
  BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments are append-only');
END;

CREATE TRIGGER tr_payments_not_over_job_total
  BEFORE INSERT ON payments
WHEN NEW.status = 'SUCCESS'
BEGIN
  SELECT RAISE(ABORT, 'payment exceeds job balance') WHERE (
    COALESCE((SELECT SUM(amount_minor) FROM payments WHERE wash_job_id = NEW.wash_job_id AND status = 'SUCCESS'), 0)
    + NEW.amount_minor
    - COALESCE((SELECT SUM(amount_minor) FROM refunds WHERE wash_job_id = NEW.wash_job_id AND status = 'SUCCESS'), 0)
  ) > (SELECT total_amount_minor FROM wash_jobs WHERE id = NEW.wash_job_id);
END;

CREATE TRIGGER tr_refunds_not_over_payment
BEFORE INSERT ON refunds
WHEN NEW.status = 'SUCCESS'
BEGIN
  SELECT RAISE(ABORT, 'refund job does not match payment') WHERE NEW.wash_job_id <> (
    SELECT wash_job_id FROM payments WHERE id = NEW.payment_id
  );
  SELECT RAISE(ABORT, 'refund exceeds successful payment') WHERE NEW.amount_minor + COALESCE((
    SELECT SUM(amount_minor) FROM refunds
    WHERE payment_id = NEW.payment_id AND status = 'SUCCESS'
  ), 0) > COALESCE((
    SELECT amount_minor FROM payments
    WHERE id = NEW.payment_id AND status = 'SUCCESS'
  ), 0);
END;

CREATE VIEW v_job_payment_totals AS
SELECT
  wj.id AS wash_job_id,
  wj.total_amount_minor,
  COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount_minor ELSE 0 END), 0) AS successful_payments_minor,
  COALESCE((SELECT SUM(CASE WHEN r.status = 'SUCCESS' THEN r.amount_minor ELSE 0 END) FROM refunds r WHERE r.wash_job_id = wj.id), 0) AS successful_refunds_minor,
  COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount_minor ELSE 0 END), 0) - COALESCE((SELECT SUM(CASE WHEN r.status = 'SUCCESS' THEN r.amount_minor ELSE 0 END) FROM refunds r WHERE r.wash_job_id = wj.id), 0) AS net_paid_minor
FROM wash_jobs wj
LEFT JOIN payments p ON p.wash_job_id = wj.id
GROUP BY wj.id;

CREATE VIEW v_daily_financials AS
SELECT
  branch_id,
  financial_date,
  SUM(revenue_minor) AS revenue_minor,
  SUM(expense_minor) AS expense_minor,
  SUM(revenue_minor) - SUM(expense_minor) AS net_profit_minor
FROM (
  SELECT branch_id, substr(paid_at, 1, 10) AS financial_date, amount_minor AS revenue_minor, 0 AS expense_minor
  FROM payments WHERE status = 'SUCCESS' AND paid_at IS NOT NULL
  UNION ALL
  SELECT branch_id, substr(processed_at, 1, 10), -amount_minor, 0
  FROM refunds WHERE status = 'SUCCESS' AND processed_at IS NOT NULL
  UNION ALL
  SELECT branch_id, expense_date, 0, amount_minor
  FROM expenses WHERE status = 'ACTIVE'
)
GROUP BY branch_id, financial_date;

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
