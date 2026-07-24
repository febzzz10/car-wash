CREATE INDEX ix_users_org_status ON users (organization_id, status);
CREATE INDEX ix_sessions_user_expiry ON user_sessions (user_id, expires_at);
CREATE INDEX ix_customers_org_name ON customers (organization_id, name_search);
CREATE INDEX ix_customers_org_phone ON customers (organization_id, phone_normalized);
CREATE INDEX ix_customers_last_visit ON customers (organization_id, last_visit_at DESC);
CREATE INDEX ix_vehicles_customer ON vehicles (customer_id, status);
CREATE INDEX ix_vehicles_registration ON vehicles (organization_id, registration_normalized);
CREATE INDEX ix_vehicles_last_wash ON vehicles (organization_id, last_wash_at DESC);
CREATE INDEX ix_services_active_order ON services (organization_id, is_active, display_order);
CREATE INDEX ix_service_prices_lookup ON service_prices (service_id, vehicle_type_id, is_active, effective_from DESC);
CREATE INDEX ix_wash_jobs_active_status ON wash_jobs (branch_id, status, created_at DESC);
CREATE INDEX ix_wash_jobs_customer_history ON wash_jobs (customer_id, created_at DESC);
CREATE INDEX ix_wash_jobs_vehicle_history ON wash_jobs (vehicle_id, created_at DESC);
CREATE INDEX ix_wash_jobs_staff_history ON wash_jobs (assigned_user_id, created_at DESC);
CREATE INDEX ix_wash_jobs_payment_status ON wash_jobs (branch_id, payment_status, completed_at DESC);
CREATE INDEX ix_wash_jobs_completed_reporting ON wash_jobs (branch_id, completed_at DESC, payment_status);
CREATE INDEX ix_vehicle_photos_job ON vehicle_photos (wash_job_id, photo_type);
CREATE INDEX ix_vehicle_photos_vehicle ON vehicle_photos (vehicle_id, created_at DESC);
CREATE INDEX ix_locations_job ON location_captures (wash_job_id, captured_at);
CREATE INDEX ix_timer_events_job_time ON timer_events (wash_job_id, event_at, created_at);
CREATE INDEX ix_coupons_validation ON coupons (organization_id, code_normalized, is_active, start_at, expires_at);
CREATE INDEX ix_coupon_redemptions_coupon ON coupon_redemptions (coupon_id, status, redeemed_at);
CREATE INDEX ix_coupon_redemptions_customer ON coupon_redemptions (customer_id, coupon_id, status);
CREATE INDEX ix_referral_codes_lookup ON referral_codes (organization_id, code_normalized, status);
CREATE INDEX ix_referral_redemptions_referrer ON referral_redemptions (referring_customer_id, status, created_at DESC);
CREATE INDEX ix_referral_rewards_customer ON referral_rewards (customer_id, status, expires_at);
CREATE INDEX ix_reward_transactions_customer ON referral_reward_transactions (customer_id, created_at DESC);
CREATE INDEX ix_payments_job ON payments (wash_job_id, status, paid_at);
CREATE INDEX ix_payments_date_method ON payments (branch_id, paid_at DESC, payment_method);
CREATE INDEX ix_refunds_job ON refunds (wash_job_id, status, processed_at);
CREATE INDEX ix_invoices_number ON invoices (organization_id, invoice_number);
CREATE INDEX ix_invoices_customer_search ON invoices (organization_id, customer_phone_snapshot, issued_at DESC);
CREATE INDEX ix_invoices_vehicle_search ON invoices (organization_id, vehicle_registration_snapshot, issued_at DESC);
CREATE INDEX ix_expenses_date_category ON expenses (branch_id, expense_date DESC, category_id, status);
CREATE INDEX ix_audit_record ON audit_logs (organization_id, record_type, record_id, created_at DESC);
CREATE INDEX ix_audit_user ON audit_logs (organization_id, user_id, created_at DESC);

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

CREATE VIEW v_customer_wash_summary AS
SELECT
  c.id AS customer_id,
  COUNT(CASE WHEN wj.status = 'COMPLETED' THEN 1 END) AS completed_wash_count,
  COALESCE(SUM(CASE WHEN wj.status = 'COMPLETED' THEN wj.total_amount_minor ELSE 0 END), 0) AS completed_wash_value_minor,
  MAX(CASE WHEN wj.status = 'COMPLETED' THEN wj.completed_at END) AS last_completed_wash_at
FROM customers c
LEFT JOIN wash_jobs wj ON wj.customer_id = c.id
GROUP BY c.id;

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
