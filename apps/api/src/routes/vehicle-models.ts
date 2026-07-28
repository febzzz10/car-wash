import { Hono } from "hono";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import type { AppBindings } from "../types";

const MAX_QUERY_LENGTH = 80;

function buildPrefixRange(query: string): { lower: string; upper: string } {
  const lower = query.toLowerCase();
  let upper = lower;
  for (let i = upper.length - 1; i >= 0; i--) {
    const char = upper.charCodeAt(i);
    if (char < 0x10ffff) {
      upper = upper.slice(0, i) + String.fromCharCode(char + 1) + upper.slice(i + 1);
      return { lower, upper };
    }
  }
  upper = lower + "\0";
  return { lower, upper };
}

export const vehicleModelRoutes = new Hono<AppBindings>();

vehicleModelRoutes.get(
  "/",
  requirePermission("vehicles.read"),
  async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length === 0) {
      return c.json({ data: [], success: true });
    }
    if (q.length > MAX_QUERY_LENGTH) {
      throw new ApiError(422, "VALIDATION_ERROR", "Query is too long.");
    }
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "10", 10) || 10, 1), 20);
    const auth = c.get("auth");
    const prefix = buildPrefixRange(q);
    const rows = await c.env.DB.prepare(
      `SELECT name
       FROM vehicle_models
       WHERE organization_id = ?
         AND normalized_name >= ?
         AND normalized_name < ?
       ORDER BY
         CASE WHEN normalized_name = ? THEN 0 ELSE 1 END,
         normalized_name ASC,
         name ASC
       LIMIT ?`,
    )
      .bind(
        auth.organizationId,
        prefix.lower,
        prefix.upper,
        q.toLowerCase(),
        limit,
      )
      .all<{ name: string }>();
    return c.json({ data: rows.results, success: true });
  },
);
