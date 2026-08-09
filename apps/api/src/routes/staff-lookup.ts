import { normalizeEmployeeCode } from "@washpro/domain";
import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requirePermission, requireSession } from "../middleware/auth";
import type { AppBindings } from "../types";

const employeeCodeQuerySchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9._-]+$/u),
});

export const staffLookupRoutes = new Hono<AppBindings>();

staffLookupRoutes.use("*", requireSession, requirePermission("payments.create"));

staffLookupRoutes.get("/by-employee-code", async (c) => {
  const parsed = employeeCodeQuerySchema.safeParse(c.req.query());
  if (!parsed.success)
    throw new ApiError(422, "VALIDATION_ERROR", "Enter a valid employee code.");
  const auth = c.get("auth");
  const normalized = normalizeEmployeeCode(parsed.data.code);
  if (normalized === null)
    throw new ApiError(
      422,
      "EMPLOYEE_CODE_NOT_FOUND",
      "Employee code not found.",
    );
  const user = await c.env.DB.prepare(
    "SELECT id, full_name, employee_code, status FROM users WHERE organization_id = ? AND employee_code_normalized = ? AND role = 'STAFF'",
  )
    .bind(auth.organizationId, normalized.normalizedName)
    .first<{ id: string; full_name: string; employee_code: string; status: string }>();
  if (user === null)
    throw new ApiError(
      422,
      "EMPLOYEE_CODE_NOT_FOUND",
      "Employee code not found.",
    );
  if (user.status !== "ACTIVE")
    throw new ApiError(
      422,
      "EMPLOYEE_INACTIVE",
      "This employee account is inactive.",
    );
  return c.json({
    data: {
      id: user.id,
      name: user.full_name,
      employeeCode: user.employee_code,
    },
    success: true,
  });
});
