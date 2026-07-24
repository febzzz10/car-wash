CREATE TABLE coupons (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_normalized TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('FIXED', 'PERCENTAGE')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  minimum_bill_minor INTEGER NOT NULL DEFAULT 0 CHECK (minimum_bill_minor >= 0),
  maximum_discount_minor INTEGER CHECK (maximum_discount_minor IS NULL OR maximum_discount_minor >= 0),
  start_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  total_usage_limit INTEGER CHECK (total_usage_limit IS NULL OR total_usage_limit > 0),
  usage_limit_per_customer INTEGER CHECK (usage_limit_per_customer IS NULL OR usage_limit_per_customer > 0),
  total_usage_count_cached INTEGER NOT NULL DEFAULT 0 CHECK (total_usage_count_cached >= 0),
  new_customers_only INTEGER NOT NULL DEFAULT 0 CHECK (new_customers_only IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, code_normalized),
  CHECK (expires_at > start_at),
  CHECK ((discount_type = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 10000) OR (discount_type = 'FIXED' AND discount_value > 0))
);

CREATE TABLE coupon_eligible_services (
  coupon_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  PRIMARY KEY (coupon_id, service_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
);

CREATE TABLE coupon_eligible_vehicle_types (
  coupon_id TEXT NOT NULL,
  vehicle_type_id TEXT NOT NULL,
  PRIMARY KEY (coupon_id, vehicle_type_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE RESTRICT
);

CREATE TABLE coupon_redemptions (
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
  UNIQUE (wash_job_id),
  CHECK (discount_amount_minor <= original_amount_minor)
);

CREATE TABLE referral_codes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'EXPIRED')),
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  successful_referrals_cached INTEGER NOT NULL DEFAULT 0 CHECK (successful_referrals_cached >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  UNIQUE (organization_id, code_normalized),
  UNIQUE (customer_id)
);

CREATE TABLE referral_redemptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  referral_code_id TEXT NOT NULL,
  referring_customer_id TEXT NOT NULL,
  referred_customer_id TEXT NOT NULL,
  referred_wash_job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'QUALIFIED', 'REWARD_ISSUED', 'CANCELLED', 'EXPIRED')),
  friend_discount_type_snapshot TEXT NOT NULL CHECK (friend_discount_type_snapshot IN ('FIXED', 'PERCENTAGE')),
  friend_discount_value_snapshot INTEGER NOT NULL,
  friend_discount_minor INTEGER NOT NULL CHECK (friend_discount_minor >= 0),
  reward_type_snapshot TEXT NOT NULL CHECK (reward_type_snapshot IN ('FIXED', 'PERCENTAGE')),
  reward_value_snapshot INTEGER NOT NULL,
  reward_amount_minor INTEGER CHECK (reward_amount_minor IS NULL OR reward_amount_minor >= 0),
  created_at TEXT NOT NULL,
  qualified_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_by_user_id TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE RESTRICT,
  FOREIGN KEY (referring_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (referred_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (referred_wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (referred_wash_job_id),
  CHECK (referring_customer_id <> referred_customer_id)
);

CREATE UNIQUE INDEX ux_referral_first_customer ON referral_redemptions (referred_customer_id) WHERE status IN ('PENDING', 'QUALIFIED', 'REWARD_ISSUED');

CREATE TABLE referral_rewards (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  referral_redemption_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'AVAILABLE', 'RESERVED', 'USED', 'EXPIRED', 'CANCELLED')),
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor >= 0),
  remaining_amount_minor INTEGER NOT NULL CHECK (remaining_amount_minor >= 0),
  earned_at TEXT,
  available_from TEXT,
  expires_at TEXT,
  reserved_for_wash_job_id TEXT,
  used_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (referral_redemption_id) REFERENCES referral_redemptions(id) ON DELETE RESTRICT,
  FOREIGN KEY (reserved_for_wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  UNIQUE (referral_redemption_id),
  CHECK (remaining_amount_minor <= original_amount_minor)
);

CREATE TABLE referral_reward_transactions (
  id TEXT PRIMARY KEY,
  referral_reward_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  wash_job_id TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('EARN', 'RESERVE', 'RELEASE', 'REDEEM', 'EXPIRE', 'CANCEL', 'ADMIN_ADJUSTMENT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  balance_after_minor INTEGER NOT NULL CHECK (balance_after_minor >= 0),
  reason TEXT,
  performed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (referral_reward_id) REFERENCES referral_rewards(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER tr_referral_reward_transactions_no_update BEFORE UPDATE ON referral_reward_transactions BEGIN SELECT RAISE(ABORT, 'reward transactions are append-only'); END;
CREATE TRIGGER tr_referral_reward_transactions_no_delete BEFORE DELETE ON referral_reward_transactions BEGIN SELECT RAISE(ABORT, 'reward transactions are append-only'); END;
