-- Composite index for cursor-based pagination on customer wash history
-- Covers: organization scope + customer filter + sort by created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS ix_wash_jobs_customer_paginated
  ON wash_jobs(organization_id, customer_id, created_at DESC, id DESC);
