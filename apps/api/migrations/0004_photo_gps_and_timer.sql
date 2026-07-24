CREATE TABLE vehicle_photos (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  wash_job_id TEXT,
  vehicle_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('LIVE_BEFORE_WASH', 'LIVE_AFTER_WASH', 'VEHICLE_FRONT', 'VEHICLE_REAR', 'OTHER')),
  capture_source TEXT NOT NULL CHECK (capture_source IN ('CAMERA', 'UPLOAD', 'SYSTEM')),
  is_mandatory_capture INTEGER NOT NULL DEFAULT 0 CHECK (is_mandatory_capture IN (0, 1)),
  captured_at TEXT,
  captured_by_user_id TEXT,
  camera_facing_mode TEXT,
  width_pixels INTEGER CHECK (width_pixels IS NULL OR width_pixels > 0),
  height_pixels INTEGER CHECK (height_pixels IS NULL OR height_pixels > 0),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (captured_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (is_mandatory_capture = 0 OR (photo_type = 'LIVE_BEFORE_WASH' AND capture_source = 'CAMERA' AND wash_job_id IS NOT NULL AND captured_at IS NOT NULL))
);

CREATE TABLE location_captures (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  wash_job_id TEXT NOT NULL,
  vehicle_photo_id TEXT,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters REAL NOT NULL CHECK (accuracy_meters >= 0),
  altitude_meters REAL,
  heading_degrees REAL,
  speed_meters_per_second REAL,
  captured_at TEXT NOT NULL,
  captured_by_user_id TEXT NOT NULL,
  business_latitude_snapshot REAL CHECK (business_latitude_snapshot IS NULL OR business_latitude_snapshot BETWEEN -90 AND 90),
  business_longitude_snapshot REAL CHECK (business_longitude_snapshot IS NULL OR business_longitude_snapshot BETWEEN -180 AND 180),
  allowed_radius_meters_snapshot REAL,
  minimum_accuracy_meters_snapshot REAL,
  distance_from_business_meters REAL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('AT_BUSINESS_LOCATION', 'OUTSIDE_BUSINESS_LOCATION', 'POOR_ACCURACY', 'COULD_NOT_VERIFY', 'OVERRIDDEN')),
  failure_reason TEXT,
  override_reason TEXT,
  overridden_by_user_id TEXT,
  overridden_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (vehicle_photo_id) REFERENCES vehicle_photos(id) ON DELETE SET NULL,
  FOREIGN KEY (captured_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (overridden_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (verification_status <> 'OVERRIDDEN' OR (override_reason IS NOT NULL AND overridden_by_user_id IS NOT NULL AND overridden_at IS NOT NULL))
);

CREATE TABLE timer_events (
  id TEXT PRIMARY KEY,
  wash_job_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('START', 'PAUSE', 'RESUME', 'END')),
  event_at TEXT NOT NULL,
  performed_by_user_id TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('USER', 'ADMIN_ADJUSTMENT', 'SYSTEM')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE timer_adjustments (
  id TEXT PRIMARY KEY,
  wash_job_id TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('START_TIME_CORRECTION', 'END_TIME_CORRECTION', 'ACTIVE_DURATION_CORRECTION', 'PAUSE_DURATION_CORRECTION')),
  previous_value TEXT,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (wash_job_id) REFERENCES wash_jobs(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TRIGGER tr_timer_events_no_update BEFORE UPDATE ON timer_events BEGIN SELECT RAISE(ABORT, 'timer events are append-only'); END;
CREATE TRIGGER tr_timer_events_no_delete BEFORE DELETE ON timer_events BEGIN SELECT RAISE(ABORT, 'timer events are append-only'); END;
CREATE TRIGGER tr_timer_adjustments_no_update BEFORE UPDATE ON timer_adjustments BEGIN SELECT RAISE(ABORT, 'timer adjustments are append-only'); END;
CREATE TRIGGER tr_timer_adjustments_no_delete BEFORE DELETE ON timer_adjustments BEGIN SELECT RAISE(ABORT, 'timer adjustments are append-only'); END;
