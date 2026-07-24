CREATE TRIGGER tr_vehicles_scope_insert
BEFORE INSERT ON vehicles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    INNER JOIN vehicle_types vt ON vt.id = NEW.vehicle_type_id
    WHERE c.id = NEW.customer_id
      AND c.organization_id = NEW.organization_id
      AND vt.organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'vehicle organization scope mismatch') END;
END;

CREATE TRIGGER tr_vehicles_scope_update
BEFORE UPDATE OF organization_id, customer_id, vehicle_type_id ON vehicles
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM customers c
    INNER JOIN vehicle_types vt ON vt.id = NEW.vehicle_type_id
    WHERE c.id = NEW.customer_id
      AND c.organization_id = NEW.organization_id
      AND vt.organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'vehicle organization scope mismatch') END;
END;

CREATE TRIGGER tr_wash_jobs_scope_insert
BEFORE INSERT ON wash_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM branches b
    INNER JOIN customers c ON c.id = NEW.customer_id
    INNER JOIN vehicles v ON v.id = NEW.vehicle_id
    INNER JOIN users assigned ON assigned.id = NEW.assigned_user_id
    INNER JOIN users creator ON creator.id = NEW.created_by_user_id
    WHERE b.id = NEW.branch_id
      AND b.organization_id = NEW.organization_id
      AND c.organization_id = NEW.organization_id
      AND v.organization_id = NEW.organization_id
      AND v.customer_id = NEW.customer_id
      AND assigned.organization_id = NEW.organization_id
      AND creator.organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'wash job organization or ownership scope mismatch') END;
END;

CREATE TRIGGER tr_wash_jobs_scope_update
BEFORE UPDATE OF organization_id, branch_id, customer_id, vehicle_id, assigned_user_id ON wash_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM branches b
    INNER JOIN customers c ON c.id = NEW.customer_id
    INNER JOIN vehicles v ON v.id = NEW.vehicle_id
    INNER JOIN users assigned ON assigned.id = NEW.assigned_user_id
    WHERE b.id = NEW.branch_id
      AND b.organization_id = NEW.organization_id
      AND c.organization_id = NEW.organization_id
      AND v.organization_id = NEW.organization_id
      AND v.customer_id = NEW.customer_id
      AND assigned.organization_id = NEW.organization_id
  ) THEN RAISE(ABORT, 'wash job organization or ownership scope mismatch') END;
END;

CREATE TRIGGER tr_timer_events_validate_transition
BEFORE INSERT ON timer_events
BEGIN
  SELECT CASE
    WHEN NEW.event_type = 'START' AND EXISTS (
      SELECT 1 FROM timer_events WHERE wash_job_id = NEW.wash_job_id
    ) THEN RAISE(ABORT, 'timer already started')
    WHEN NEW.event_type = 'PAUSE' AND COALESCE((
      SELECT event_type FROM timer_events
      WHERE wash_job_id = NEW.wash_job_id
      ORDER BY event_at DESC, created_at DESC, rowid DESC LIMIT 1
    ), '') NOT IN ('START', 'RESUME') THEN RAISE(ABORT, 'timer is not running')
    WHEN NEW.event_type = 'RESUME' AND COALESCE((
      SELECT event_type FROM timer_events
      WHERE wash_job_id = NEW.wash_job_id
      ORDER BY event_at DESC, created_at DESC, rowid DESC LIMIT 1
    ), '') <> 'PAUSE' THEN RAISE(ABORT, 'timer is not paused')
    WHEN NEW.event_type = 'END' AND COALESCE((
      SELECT event_type FROM timer_events
      WHERE wash_job_id = NEW.wash_job_id
      ORDER BY event_at DESC, created_at DESC, rowid DESC LIMIT 1
    ), '') NOT IN ('START', 'PAUSE', 'RESUME') THEN RAISE(ABORT, 'timer cannot end')
  END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM timer_events
    WHERE wash_job_id = NEW.wash_job_id AND event_at > NEW.event_at
  ) THEN RAISE(ABORT, 'timer events must use chronological server timestamps') END;
END;

CREATE TRIGGER tr_coupon_redemptions_limits
BEFORE INSERT ON coupon_redemptions
WHEN NEW.status IN ('RESERVED', 'REDEEMED')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = NEW.coupon_id
      AND c.total_usage_limit IS NOT NULL
      AND c.total_usage_count_cached >= c.total_usage_limit
  ) THEN RAISE(ABORT, 'coupon total usage limit reached') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.id = NEW.coupon_id
      AND c.usage_limit_per_customer IS NOT NULL
      AND (
        SELECT COUNT(*) FROM coupon_redemptions cr
        WHERE cr.coupon_id = NEW.coupon_id
          AND cr.customer_id = NEW.customer_id
          AND cr.status IN ('RESERVED', 'REDEEMED')
      ) >= c.usage_limit_per_customer
  ) THEN RAISE(ABORT, 'coupon customer usage limit reached') END;
END;

CREATE TRIGGER tr_payments_not_over_job_total
BEFORE INSERT ON payments
WHEN NEW.status = 'SUCCESS'
BEGIN
  SELECT CASE WHEN (
    COALESCE((SELECT SUM(amount_minor) FROM payments WHERE wash_job_id = NEW.wash_job_id AND status = 'SUCCESS'), 0)
    + NEW.amount_minor
    - COALESCE((SELECT SUM(amount_minor) FROM refunds WHERE wash_job_id = NEW.wash_job_id AND status = 'SUCCESS'), 0)
  ) > (SELECT total_amount_minor FROM wash_jobs WHERE id = NEW.wash_job_id)
  THEN RAISE(ABORT, 'payment exceeds job balance') END;
END;

CREATE TRIGGER tr_refunds_not_over_payment
BEFORE INSERT ON refunds
WHEN NEW.status = 'SUCCESS'
BEGIN
  SELECT CASE WHEN NEW.wash_job_id <> (
    SELECT wash_job_id FROM payments WHERE id = NEW.payment_id
  ) THEN RAISE(ABORT, 'refund job does not match payment') END;
  SELECT CASE WHEN NEW.amount_minor + COALESCE((
    SELECT SUM(amount_minor) FROM refunds
    WHERE payment_id = NEW.payment_id AND status = 'SUCCESS'
  ), 0) > COALESCE((
    SELECT amount_minor FROM payments
    WHERE id = NEW.payment_id AND status = 'SUCCESS'
  ), 0) THEN RAISE(ABORT, 'refund exceeds successful payment') END;
END;

CREATE TRIGGER tr_vehicle_photos_ready_private_asset
BEFORE INSERT ON vehicle_photos
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM file_assets fa
    WHERE fa.id = NEW.file_asset_id
      AND fa.organization_id = NEW.organization_id
      AND fa.upload_status = 'READY'
      AND fa.access_level = 'PRIVATE'
  ) THEN RAISE(ABORT, 'vehicle photo asset must be ready and private') END;
END;

CREATE TRIGGER tr_vehicle_assets_never_public_insert
BEFORE INSERT ON file_assets
WHEN NEW.asset_type IN ('VEHICLE_LIVE_PHOTO', 'VEHICLE_PROFILE_PHOTO')
  AND NEW.access_level <> 'PRIVATE'
BEGIN
  SELECT RAISE(ABORT, 'customer vehicle assets must remain private');
END;

CREATE TRIGGER tr_vehicle_assets_never_public_update
BEFORE UPDATE OF access_level ON file_assets
WHEN OLD.asset_type IN ('VEHICLE_LIVE_PHOTO', 'VEHICLE_PROFILE_PHOTO')
  AND NEW.access_level <> 'PRIVATE'
BEGIN
  SELECT RAISE(ABORT, 'customer vehicle assets must remain private');
END;

CREATE TRIGGER tr_audit_no_sensitive_values
BEFORE INSERT ON audit_logs
BEGIN
  SELECT CASE WHEN lower(
    COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')
  ) LIKE '%password_hash%'
    OR lower(COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')) LIKE '%session_token%'
    OR lower(COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')) LIKE '%authorization%'
    OR lower(COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')) LIKE '%cookie%'
    OR lower(COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')) LIKE '%card_number%'
    OR lower(COALESCE(NEW.previous_value_json, '') || ' ' || COALESCE(NEW.new_value_json, '')) LIKE '%upi_pin%'
  THEN RAISE(ABORT, 'sensitive values are forbidden in audit logs') END;
END;
