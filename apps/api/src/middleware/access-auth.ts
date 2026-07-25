import type { Permission, UserRole, UserStatus } from "@washpro/contracts";
import { PERMISSIONS } from "@washpro/contracts";
import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors";
import { accessConfig, verifyAccessJwt } from "../security/access-jwt";
import type { AppBindings, AuthContext } from "../types";

interface AccessUserRow {
  readonly default_branch_id: string | null;
  readonly email: string | null;
  readonly full_name: string;
  readonly id: string;
  readonly organization_id: string;
  readonly permissions_json: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
}

function parsePermissions(value: string | null): readonly Permission[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set<string>(PERMISSIONS);
    return parsed.filter(
      (permission): permission is Permission =>
        typeof permission === "string" && allowed.has(permission),
    );
  } catch {
    return [];
  }
}

function isAccessMode(env: Env): boolean {
  return env.APP_ENV === "production" && env.AUTH_MODE === "cloudflare_access";
}

export const requireAccessAuth = createMiddleware<AppBindings>(async (c, next) => {
  if (!isAccessMode(c.env)) return await next();

  const token = c.req.header("cf-access-jwt-assertion");
  if (token === undefined || token === "") {
    throw new ApiError(
      401,
      "AUTH_SESSION_EXPIRED",
      "Access identity is required.",
    );
  }
  const claims = await verifyAccessJwt(token, accessConfig(c.env));
  const normalizedEmail = claims.email.trim().toLowerCase();

  const row = await c.env.DB.prepare(
    `SELECT id, organization_id, default_branch_id, full_name, role, status,
      email, permissions_json, version
    FROM users
    WHERE email_normalized = ?
    LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<AccessUserRow>();

  if (row === null) {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "Your email is not authorized to access WashPro.",
    );
  }
  if (row.status === "DISABLED") {
    throw new ApiError(
      403,
      "AUTH_ACCOUNT_DISABLED",
      "This account is disabled.",
    );
  }
  if (row.status === "LOCKED") {
    throw new ApiError(
      423,
       "AUTH_ACCOUNT_LOCKED",
       "This account is temporarily locked.",
    );
  }

  const auth: AuthContext = {
    branchId: row.default_branch_id,
    organizationId: row.organization_id,
    permissions: parsePermissions(row.permissions_json),
    role: row.role,
    sessionId: `access-${crypto.randomUUID()}`,
    userId: row.id,
    userName: row.full_name,
  };
  c.set("auth", auth);

  await next();
});
