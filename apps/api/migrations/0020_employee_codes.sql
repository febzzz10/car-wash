ALTER TABLE users ADD COLUMN employee_code TEXT;
ALTER TABLE users ADD COLUMN employee_code_normalized TEXT;
CREATE UNIQUE INDEX ux_users_employee_code ON users (organization_id, employee_code_normalized) WHERE employee_code_normalized IS NOT NULL;

ALTER TABLE payments ADD COLUMN collected_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN collected_by_name_snapshot TEXT;
ALTER TABLE payments ADD COLUMN collected_by_employee_code_snapshot TEXT;
