import { Hono } from "hono";

import { ApiError } from "../http/errors";
import { requireAdmin, requirePermission } from "../middleware/auth";
import type { AppBindings } from "../types";

export const auditRoutes = new Hono<AppBindings>();
auditRoutes.use("*", requireAdmin, requirePermission("audit.read"));

auditRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const recordType = c.req.query("recordType");
  const severity = c.req.query("severity");
  const result = await c.env.DB.prepare(
    `SELECT al.*, u.full_name AS user_name
     FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
     WHERE al.organization_id = ?
       AND (? IS NULL OR al.record_type = ?)
       AND (? IS NULL OR al.severity = ?)
     ORDER BY al.created_at DESC LIMIT 500`,
  )
    .bind(
      auth.organizationId,
      recordType ?? null,
      recordType ?? null,
      severity ?? null,
      severity ?? null,
    )
    .all();
  return c.json({ data: result.results, success: true });
});

auditRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const row = await c.env.DB.prepare(
    "SELECT * FROM audit_logs WHERE id = ? AND organization_id = ?",
  )
    .bind(c.req.param("id"), auth.organizationId)
    .first();
  if (row === null)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Audit entry not found.");
  return c.json({ data: row, success: true });
});
