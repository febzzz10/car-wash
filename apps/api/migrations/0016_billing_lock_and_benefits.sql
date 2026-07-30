-- 0016: Billing lock, rounding mode, guard table, reward tracking, coupon index fix

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

-- Rebuild coupon_redemptions: replace table-level UNIQUE(wash_job_id) with
-- partial unique index allowing only one active RESERVED row per wash job.
-- Historical RELEASED/REDEEMED/CANCELLED rows are preserved.
CREATE TABLE coupon_redemptions_new (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  wash_job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESERVED', 'REDEEMED', 'RELEASED', 'CANCELLED')),
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor >= 0),
  discount_amount_minor INTEGER NOT NULL CHECK (discount_amount_minor >= 0),
  coupon_code_snapshot TEXT NOT NULL,
  discount_type_snapshot TEXT NOT NULL CHECK (discount_type_snapshot IN ('FIXED', 'PERCENTAGE')),
  discount_value_snapshot INTEGER NOT NULL,
  reserved_at TEXT NOT NULL,
  redeemed_at TEXT,
  released_at TEXT,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (discount_amount_minor <= original_amount_minor)
);

INSERT INTO coupon_redemptions_new SELECT * FROM coupon_redemptions;
DROP TABLE coupon_redemptions;
ALTER TABLE coupon_redemptions_new RENAME TO coupon_redemptions;

CREATE UNIQUE INDEX ux_coupon_redemption_active
  ON coupon_redemptions (wash_job_id) WHERE status = 'RESERVED';

CREATE INDEX ix_coupon_redemptions_coupon ON coupon_redemptions (coupon_id, status, redeemed_at);
CREATE INDEX ix_coupon_redemptions_customer ON coupon_redemptions (customer_id, coupon_id, status);

CREATE TRIGGER tr_coupon_redemptions_limits
BEFORE INSERT ON coupon_redemptions
WHEN NEW.status IN ('RESERVED', 'REDEEMED')
BEGIN
  SELECT RAISE(ABORT, 'coupon total usage limit reached') WHERE EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = NEW.coupon_id
      AND c.total_usage_limit IS NOT NULL
      AND c.total_usage_count_cached >= c.total_usage_limit
  );
  SELECT RAISE(ABORT, 'coupon customer usage limit reached') WHERE EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = NEW.coupon_id
      AND c.usage_limit_per_customer IS NOT NULL
      AND (
        SELECT COUNT(*) FROM coupon_redemptions cr
        WHERE cr.coupon_id = NEW.coupon_id
          AND cr.customer_id = NEW.customer_id
          AND cr.status IN ('RESERVED', 'REDEEMED')
      ) >= c.usage_limit_per_customer
  );
END;

-- Backfill rounding_mode: set NEAREST_RUPEE where rounding_minor proves it
UPDATE wash_jobs SET rounding_mode = 'NEAREST_RUPEE'
WHERE rounding_minor <> 0 AND rounding_mode IS NULL;

-- Backfill billing lock for already-paid jobs
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
