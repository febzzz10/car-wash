import type { Permission, UserRole, UserStatus } from "@washpro/contracts";
import { PERMISSIONS } from "@washpro/contracts";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors";
import { assertAllowedOrigin, isUnsafeMethod } from "../http/request";
import {
  createCsrfToken,
  equalTokens,
  hashSessionToken,
} from "../security/tokens";
import type { AppBindings, AuthContext } from "../types";

export const sessionCookieName = "__Host-washpro_session";

interface SessionRow {
  readonly default_branch_id: string | null;
  readonly expires_at: string;
  readonly full_name: string;
  readonly organization_id: string;
  readonly permissions_json: string | null;
  readonly role: UserRole;
  readonly session_id: string;
  readonly session_status: string;
  readonly user_id: string;
  readonly user_status: UserStatus;
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

export const requireSession = createMiddleware<AppBindings>(async (c, next) => {
  const rawToken = getCookie(c, sessionCookieName);
  if (rawToken === undefined) {
    throw new ApiError(401, "AUTH_SESSION_EXPIRED", "Sign in to continue.");
  }
  const tokenHash = await hashSessionToken(rawToken, c.env.SESSION_PEPPER);
  const row = await c.env.DB.prepare(
    `SELECT
      s.id AS session_id, s.organization_id, s.status AS session_status,
      s.expires_at, u.id AS user_id, u.default_branch_id, u.full_name,
      u.role, u.status AS user_status, u.permissions_json
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id AND u.organization_id = s.organization_id
    WHERE s.token_hash = ?
    LIMIT 1`,
  )
    .bind(tokenHash)
    .first<SessionRow>();

  if (
    row === null ||
    row.session_status !== "ACTIVE" ||
    row.user_status !== "ACTIVE" ||
    Date.parse(row.expires_at) <= Date.now()
  ) {
    throw new ApiError(
      401,
      "AUTH_SESSION_EXPIRED",
      "Your session has expired.",
    );
  }

  const auth: AuthContext = {
    branchId: row.default_branch_id,
    organizationId: row.organization_id,
    permissions: parsePermissions(row.permissions_json),
    role: row.role,
    sessionId: row.session_id,
    userId: row.user_id,
    userName: row.full_name,
  };
  c.set("auth", auth);
  c.set("rawSessionToken", rawToken);

  if (isUnsafeMethod(c.req.method)) {
    assertAllowedOrigin(c);
    const supplied = c.req.header("x-csrf-token") ?? "";
    const expected = await createCsrfToken(rawToken, c.env.CSRF_SECRET);
    if (!equalTokens(supplied, expected)) {
      throw new ApiError(
        403,
        "CSRF_REJECTED",
        "The security token was rejected.",
      );
    }
  }

  await next();
});

export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (c.get("auth").role !== "ADMIN") {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "You do not have permission to perform this action.",
    );
  }
  await next();
});

export function requirePermission(permission: Permission) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const auth = c.get("auth");
    if (auth.role !== "ADMIN" && !auth.permissions.includes(permission)) {
      throw new ApiError(
        403,
        "AUTH_PERMISSION_DENIED",
        "You do not have permission to perform this action.",
      );
    }
    await next();
  });
}
