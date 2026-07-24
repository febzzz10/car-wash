CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, name)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  expense_reference TEXT,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  expense_date TEXT NOT NULL,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  recorded_by_user_id TEXT NOT NULL,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, expense_reference),
  CHECK (status <> 'CANCELLED' OR (cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL AND length(trim(cancellation_reason)) > 0))
);

CREATE TABLE expense_attachments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  attachment_type TEXT NOT NULL DEFAULT 'RECEIPT' CHECK (attachment_type IN ('RECEIPT', 'INVOICE', 'OTHER')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT,
  UNIQUE (expense_id, file_asset_id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  branch_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  previous_value_json TEXT,
  new_value_json TEXT,
  reason TEXT,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_information TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER tr_audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit logs are append-only'); END;
CREATE TRIGGER tr_audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit logs are append-only'); END;
CREATE TRIGGER tr_expenses_no_delete BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT, 'expenses must be cancelled, not deleted'); END;
