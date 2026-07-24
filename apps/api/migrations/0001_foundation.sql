PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL UNIQUE,
  checksum TEXT,
  applied_at TEXT NOT NULL,
  execution_ms INTEGER
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  legal_name TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  default_currency TEXT NOT NULL DEFAULT 'INR',
  default_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country_code TEXT NOT NULL DEFAULT 'IN',
  phone TEXT,
  whatsapp_number TEXT,
  email TEXT,
  latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  allowed_radius_meters REAL NOT NULL DEFAULT 100 CHECK (allowed_radius_meters > 0),
  minimum_gps_accuracy_meters REAL NOT NULL DEFAULT 100 CHECK (minimum_gps_accuracy_meters > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (organization_id, code)
);

CREATE TABLE business_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT,
  setting_key TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('STRING', 'INTEGER', 'BOOLEAN', 'JSON')),
  value_text TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, branch_id, setting_key)
);

CREATE TABLE number_sequences (
  organization_id TEXT NOT NULL,
  branch_id TEXT,
  sequence_type TEXT NOT NULL CHECK (sequence_type IN ('WASH_JOB', 'INVOICE', 'EXPENSE')),
  sequence_year INTEGER NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, branch_id, sequence_type, sequence_year),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  idempotency_key TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body_json TEXT,
  resource_type TEXT,
  resource_id TEXT,
  state TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (state IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, operation_type, idempotency_key)
);

CREATE TABLE file_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'R2' CHECK (storage_provider = 'R2'),
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('VEHICLE_LIVE_PHOTO', 'VEHICLE_PROFILE_PHOTO', 'BUSINESS_LOGO', 'EXPENSE_RECEIPT', 'INVOICE_PDF', 'OTHER')),
  access_level TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (access_level IN ('PRIVATE', 'TOKEN_PROTECTED', 'PUBLIC')),
  upload_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (upload_status IN ('PENDING', 'READY', 'FAILED', 'DELETED')),
  uploaded_by_user_id TEXT,
  created_at TEXT NOT NULL,
  ready_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (bucket_name, object_key)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  default_branch_id TEXT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  email TEXT,
  email_normalized TEXT,
  phone TEXT,
  phone_normalized TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
  permissions_json TEXT,
  profile_photo_asset_id TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  created_by_user_id TEXT,
  disabled_at TEXT,
  disabled_by_user_id TEXT,
  disabled_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (profile_photo_asset_id) REFERENCES file_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (disabled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, username_normalized)
);

CREATE UNIQUE INDEX ux_users_email_active ON users (organization_id, email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX ux_users_phone_active ON users (organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL;

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  ip_address TEXT,
  user_agent TEXT,
  device_name TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  attempted_identifier TEXT,
  matched_user_id TEXT,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  created_by_user_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
