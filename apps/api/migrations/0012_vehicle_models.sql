-- Migration 0012: Vehicle model autocomplete dictionary
-- Stores normalized vehicle models per organization for autocomplete suggestions.

CREATE TABLE IF NOT EXISTS vehicle_models (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE,
  UNIQUE (organization_id, normalized_name)
);
